# Base de datos NexaLab

## Archivos

| Archivo | Uso |
| --- | --- |
| `0001_init.sql` | Esquema operativo inicial multiempresa y multilaboratorio. |
| `0002_seed_demo.sql` | Datos demostrativos iniciales opcionales. |
| `0003_optional_rls.sql` | Patrón de RLS para endurecimiento posterior. No se aplica automáticamente. |
| `0004_configurable_compliance_core.sql` | Configuración versionada, roles granulares, alertas, flujos, QR, calidad, documentos, firmas, evidencia y protección append-only. |
| `0005_seed_configurable_demo.sql` | Plantillas y datos demostrativos para la ampliación configurable. |
| `0006_secure_qr_labels.sql` | Códigos temporales de un solo uso, bitácora de escaneos y etiquetas QR para recursos existentes. |
| `0011_profile_tutorial_notifications.sql` | Progreso de tutorial guiado por usuario (`users.tutorial_state`) y estado de lectura de notificaciones por usuario (`user_notification_reads`). Avatar de usuario y logo institucional reutilizan `attachments` (`entity_type='user_avatar'` / `'organization_logo'`), sin tablas nuevas de archivos. |
| `0015_educational_revision_v1.sql` | Preferencias, tipos y controles de inventario, prácticas/participantes, seguimiento de incidencias, archivo de equipos y reglas/escalamientos educativos. |
| `0019_purchasing.sql` | Módulo de compras: `purchase_requests` (cabecera de solicitud/orden) y `purchase_request_items` (líneas, con enlace opcional a un artículo de inventario). No modifica inventario ni movimientos. |

## Instalación nueva

```bash
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
psql "$DIRECT_URL" -f database/0006_secure_qr_labels.sql
```

## Actualizar una base creada con la versión anterior

```bash
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
psql "$DIRECT_URL" -f database/0006_secure_qr_labels.sql
```

## Decisiones importantes

- Los movimientos de inventario calculan el nuevo balance mediante trigger. La aplicación debe registrar movimientos en lugar de editar existencias directamente.
- `audit_logs` y `electronic_signatures` quedan protegidos contra actualización y eliminación.
- Los archivos grandes no se almacenan en PostgreSQL. La tabla `attachments` conserva metadatos, versión y hash del archivo guardado en object storage.
- La personalización usa campos adicionales y versiones de configuración; los registros históricos no se reinterpretan silenciosamente.
- Antes de aplicar RLS, todas las transacciones deben establecer correctamente el tenant activo.
- Los QR físicos contienen solamente un token opaco. La consulta externa requiere un código temporal de un solo uso; el código se almacena como HMAC y los intentos quedan trazados.

## Tenant educativo vacío

Con las migraciones aplicadas, define la contraseña sin escribirla en argumentos ni archivos y ejecuta:

```bash
CLEAN_TENANT_ADMIN_PASSWORD='<contraseña-de-12-o-más-caracteres>' npm run tenant:create-clean-educational -- --name 'Institución' --slug 'institucion-educativa' --admin-email 'admin@institucion.edu'
```

Para cuentas controladas de QA puede asignarse una suscripción local activa con `--plan academic_starter`, `--plan professional` o `--plan multi_site`. Esta opción no crea clientes ni cobros en Recurrente y deja el origen de aprovisionamiento identificado en la suscripción y en auditoría.

En un job pueden utilizarse los equivalentes `CLEAN_TENANT_NAME`, `CLEAN_TENANT_SLUG`, `CLEAN_TENANT_ADMIN_EMAIL`, `CLEAN_TENANT_ADMIN_NAME`, `CLEAN_TENANT_LABORATORY`, `CLEAN_TENANT_PLAN` y `CLEAN_TENANT_INCLUDE_RULES`, manteniendo la contraseña en `CLEAN_TENANT_ADMIN_PASSWORD` como referencia a un secreto.

`--include-rules` agrega tres reglas base opcionales. El comando rechaza slugs o correos existentes, usa una transacción y no crea artículos, equipos, prácticas, reservas, alertas ficticias ni logo. Nunca se ejecuta automáticamente.

Para convertir un laboratorio existente sin borrar sus datos, primero inspecciona y después confirma explícitamente:

```bash
TARGET_USER_EMAIL='admin@institucion.edu' npm run tenant:set-educational-profile
TARGET_USER_EMAIL='admin@institucion.edu' APPLY_PROFILE_CHANGE=true npm run tenant:set-educational-profile
```

El comando utiliza la primera membresía activa, conserva el rol y el plan, actualiza únicamente `laboratory_settings.profile_code` y registra el cambio en auditoría.

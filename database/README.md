# Base de datos NexaLab

## Archivos

| Archivo | Uso |
| --- | --- |
| `0001_init.sql` | Esquema operativo inicial multiempresa y multilaboratorio. |
| `0002_seed_demo.sql` | Datos demostrativos iniciales opcionales. |
| `0003_optional_rls.sql` | Patrón de RLS para endurecimiento posterior. No se aplica automáticamente. |
| `0004_configurable_compliance_core.sql` | Configuración versionada, roles granulares, alertas, flujos, QR, calidad, documentos, firmas, evidencia y protección append-only. |
| `0005_seed_configurable_demo.sql` | Plantillas y datos demostrativos para la ampliación configurable. |

## Instalación nueva

```bash
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
```

## Actualizar una base creada con la versión anterior

```bash
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
```

## Decisiones importantes

- Los movimientos de inventario calculan el nuevo balance mediante trigger. La aplicación debe registrar movimientos en lugar de editar existencias directamente.
- `audit_logs` y `electronic_signatures` quedan protegidos contra actualización y eliminación.
- Los archivos grandes no se almacenan en PostgreSQL. La tabla `attachments` conserva metadatos, versión y hash del archivo guardado en object storage.
- La personalización usa campos adicionales y versiones de configuración; los registros históricos no se reinterpretan silenciosamente.
- Antes de aplicar RLS, todas las transacciones deben establecer correctamente el tenant activo.

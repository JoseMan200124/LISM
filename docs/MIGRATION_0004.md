# Guía de migración: núcleo configurable y cumplimiento

## Aplicar sobre una base existente

Realiza un respaldo antes de migrar.

```bash
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
```

La semilla `0005` es opcional y está pensada para demostración.

## Cambios relevantes

- Nuevos roles sugeridos.
- Audit trail enriquecido y protegido contra mutación.
- Firmas electrónicas append-only.
- Configuración versionada.
- Campos personalizados.
- Flujos y transiciones.
- Permisos granulares.
- Adjuntos con hash.
- QR opaco.
- Balance de inventario calculado por movimientos.
- Planes y certificados de equipo.
- Cadena de custodia.
- Métodos y especificaciones versionadas.
- Revisiones de resultados.
- OOS, OOT y CAPA.
- Documentos controlados.
- Competencia del personal.
- Monitoreo ambiental.
- Bitácoras.
- Alertas configurables.
- Perfil educativo.
- Paquetes regulatorios y evidencia.
- Registro de verificación de respaldos.

## Precaución con inventario

Después de aplicar la migración, registra cambios de saldo mediante `inventory_movements`. No uses actualizaciones directas de `inventory_items.quantity` desde formularios.

## Precaución con RLS

`0003_optional_rls.sql` continúa siendo deliberadamente opcional. Primero crea pruebas de acceso cruzado y asegura que cada transacción configura el contexto de tenant.

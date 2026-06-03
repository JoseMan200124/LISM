# Base de datos

## Archivos

- `0001_init.sql`: esquema inicial.
- `0002_seed_demo.sql`: datos semilla opcionales.
- `0003_optional_rls.sql`: patrón documentado para endurecimiento posterior; no se aplica automáticamente.

## Ejecutar

```bash
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
```

# Desplegar en Azure (Container Apps)

LISM también puede correr en Azure Container Apps en vez de Vercel + Neon (ver
[`DEPLOY_VERCEL_NEON.md`](DEPLOY_VERCEL_NEON.md) para esa ruta). Toda la infraestructura —
Terraform, CI/CD, runbooks — vive en un repositorio separado:
[`lism-infra`](https://github.com/JoseMan200124/lism-infra).

Este documento solo cubre lo que cambia **del lado de la aplicación**. Para arquitectura,
costos, despliegue paso a paso, migraciones, seguridad y disaster recovery, ve a la
documentación de `lism-infra/docs/`.

## Qué cambia en este repo para soportar Azure

- **`Dockerfile`** — build multi-stage Node 22, usuario no root, usa el output
  `standalone` de Next.js (`next.config.ts` → `output: "standalone"`).
- **`lib/db.ts`** — soporta dos drivers de base de datos:
  - `DATABASE_DRIVER` sin definir (o `neon`): comportamiento idéntico al actual,
    `@neondatabase/serverless` sobre Neon.
  - `DATABASE_DRIVER=azure_postgresql`: usa `pg` (wire protocol estándar), necesario
    porque el driver de Neon habla HTTP propietario y no funciona contra un Postgres
    genérico como Azure Database for PostgreSQL Flexible Server.

  Ninguna de las ~40 llamadas a `getSql()` en el resto del código cambió — el adaptador
  imita la firma de `neon()`.
- **`scripts/run-migrations.mjs`** — runner de migraciones con tabla de control
  `schema_migrations` (checksum por archivo, nunca reaplica, nunca corre seeds
  automáticamente). Se invoca manualmente, nunca al arrancar la app. Ver
  `lism-infra/docs/database-migrations.md`.
- **`.env.example`** — documenta las variables nuevas no secretas
  (`DATABASE_DRIVER`, `DIRECT_URL`, `QR_ACCESS_SECRET`, `PORT`, `APP_URL`, etc.).

## Probar la imagen Docker localmente

```bash
npm run build   # genera .next/standalone
docker build -t lism-web:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@host/db?sslmode=require" \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -e DEMO_MODE=false \
  lism-web:local
curl http://localhost:3000/api/health
```

Sin `DATABASE_URL`, la app arranca en modo demo (`{"ok":true,"mode":"demo",...}`).

## Resumen del flujo completo

```text
git push (LISM)
  -> deploy-lism.yml (en lism-infra, vía GitHub OIDC)
      -> npm ci / typecheck / test / build
      -> docker build + push a ACR
      -> actualizar revisión de la Container App
      -> smoke test /api/health
```

Las migraciones **no** corren automáticamente en el deploy — se disparan aparte vía
`run-migrations.yml` o `az containerapp job start`. Ver
`lism-infra/docs/database-migrations.md` y `lism-infra/docs/runbook.md`.

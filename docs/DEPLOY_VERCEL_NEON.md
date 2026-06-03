# Desplegar en Vercel con Neon

## 1. Preparar Neon

Crea un proyecto y una base de datos en Neon. Copia dos cadenas de conexión:

- `DATABASE_URL`: conexión pooled; el host contiene `-pooler`.
- `DIRECT_URL`: conexión directa; úsala para migraciones y tareas administrativas.

Aplica el esquema desde tu terminal:

```bash
export DIRECT_URL='postgresql://...'
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
```

## 2. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: initial NexaLab LIS MVP"
git branch -M main
git remote add origin <TU_REPOSITORIO>
git push -u origin main
```

No subas `.env`, `.env.local` ni secretos.

## 3. Crear el proyecto en Vercel

Importa el repositorio y configura estas variables:

```text
DATABASE_URL=<URL pooled de Neon>
DIRECT_URL=<URL directa de Neon>
SESSION_SECRET=<valor aleatorio de al menos 32 caracteres>
DEMO_MODE=false
NEXT_PUBLIC_APP_NAME=NexaLab LIS
```

## 4. Verificar

Después del despliegue visita:

```text
/api/health
```

La respuesta esperada incluye:

```json
{ "ok": true, "mode": "database", "database": "connected" }
```

Inicia sesión con:

```text
admin@nexalab.local
Demo1234!
```

Cambia la contraseña inmediatamente en cuanto implementes el flujo de administración persistente.

## 5. Recomendaciones de bajo costo

- Mantén Vercel y Neon en regiones cercanas.
- Usa `DATABASE_URL` pooled para tráfico de la aplicación.
- Reserva `DIRECT_URL` para migraciones.
- Activa ramas de preview de Neon cuando conectes la integración con Vercel.
- Evita guardar archivos en PostgreSQL; usa almacenamiento de objetos cuando incorpores adjuntos.

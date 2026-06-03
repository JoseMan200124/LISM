# NexaLab LIS

MVP funcional y escalable de un **Laboratory Information System (LIS)** para laboratorios universitarios, de investigación y laboratorios operativos que necesitan trazabilidad desde la recepción de muestras hasta la liberación de resultados.

El proyecto incluye:

- Interfaz profesional, minimalista y responsiva.
- Navegación por flujo preanalítico, analítico y postanalítico.
- Dashboard operativo, mesa de trabajo, muestras, órdenes, resultados, pacientes, solicitantes, catálogo, inventario, equipos, calidad, alertas, reportes, integraciones, auditoría y administración.
- Inicio de sesión de demostración con cookie firmada.
- Modo demo sin base de datos para presentar el producto de inmediato.
- Esquema PostgreSQL para Neon con entidades multiempresa y multilaboratorio.
- API inicial para autenticación, salud del sistema, muestras e inventario.
- Datos semilla para levantar una instancia conectada a Neon.
- Documentación de arquitectura, UI/UX, despliegue, módulos, trazabilidad de investigación, roadmap, precios, validación técnica y endurecimiento antes de producción.

## Vista rápida

Credenciales del modo demo:

```text
Correo: admin@nexalab.local
Contraseña: Demo1234!
```

## Ejecutar localmente

Requisitos: Node.js 20.9 o superior.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abre `http://localhost:3000`. El archivo `.env.example` tiene `DEMO_MODE="true"`, por lo que la interfaz funciona incluso sin Neon.

## Conectar Neon

1. Crea un proyecto en Neon.
2. Copia la URL **pooled** en `DATABASE_URL` y la URL directa en `DIRECT_URL`.
3. Define un `SESSION_SECRET` aleatorio y largo.
4. Ejecuta las migraciones:

```bash
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
```

5. Cambia `DEMO_MODE="false"`.
6. Ejecuta la app e inicia sesión con las mismas credenciales demo.

## Compilar

```bash
npm run typecheck
npm run build
npm run start
```

## Desplegar en Vercel

Consulta [docs/DEPLOY_VERCEL_NEON.md](docs/DEPLOY_VERCEL_NEON.md).

## Alcance responsable

Esta entrega es una base de producto y un MVP comercial demostrable. **No debe usarse todavía para emitir resultados clínicos reales** sin completar validación funcional, pruebas de aceptación, controles regulatorios aplicables, seguridad, privacidad, respaldo, recuperación, observabilidad y procedimientos operativos del laboratorio. El documento [docs/PRODUCTION_HARDENING.md](docs/PRODUCTION_HARDENING.md) separa claramente lo demostrable de lo necesario antes de operar con datos sensibles.

## Estructura

```text
app/                 Next.js App Router, pantallas y API route handlers
components/          Componentes de interfaz
lib/                 Datos demo, sesión, navegación y conexión Neon
database/            Migraciones SQL y datos semilla
docs/                Arquitectura, UI/UX, módulos, investigación, roadmap, despliegue, pricing, validación y hardening
```

# NexaLab LIMS configurable

NexaLab es una base funcional de **Laboratory Information Management System (LIMS)** orientada a laboratorios universitarios, farmacéuticos, clínicos, industriales, de alimentos, agua y calibración. La interfaz prioriza simplicidad, trazabilidad y configuración sin programación.

Esta versión amplía el proyecto inicial con:

- Perfil configurable por tipo de laboratorio.
- Inventario por lotes con movimientos, FEFO, ubicaciones jerárquicas y QR.
- Equipos con planes periódicos, certificados y bloqueo preventivo configurable.
- Ciclo continuo de muestras y transición de estados configurable por versión y trazable.
- Campos personalizados versionados.
- Alertas personalizables, reconocimiento y escalamiento.
- Roles sugeridos: administrador, jefe de laboratorio, analista, auxiliar, inspector/auditor, consulta, profesor y estudiante, con navegación y APIs restringidas por permiso.
- Calidad integrada: OOS, OOT, CAPA, documentos controlados, monitoreo ambiental, bitácoras, competencia y firmas electrónicas.
- Centro de cumplimiento simplificado para ISO/IEC 17025, ISO 15189, BPM/BPL, 21 CFR Part 11, ISO/IEC 27001, ISO/IEC 25010 e ISO 9001.
- Migración PostgreSQL adicional con estructuras para trazabilidad, evidencia y configuración.
- APIs iniciales para configuración, movimientos, planes de equipo, resultados, OOS, firmas, QR y transiciones de muestra.

## Importante

El software incorpora controles que **apoyan** el cumplimiento normativo, pero instalarlo no acredita automáticamente a un laboratorio. Una operación regulada requiere validación formal, procedimientos internos, capacitación, aprobación del laboratorio, controles de seguridad, respaldo probado y revisión de las normas licenciadas aplicables.

## Modo demostración

Credenciales:

```text
Correo: admin@nexalab.local
Contraseña: Demo1234!
```

Ejecutar:

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Abrir `http://localhost:3000`.

## Compilar y verificar

```bash
npm run typecheck
npm run build
```

También puedes ejecutar:

```bash
bash scripts/verify.sh
```

## Base de datos Neon/PostgreSQL

Para una instalación nueva:

```bash
psql "$DIRECT_URL" -f database/0001_init.sql
psql "$DIRECT_URL" -f database/0002_seed_demo.sql
psql "$DIRECT_URL" -f database/0004_configurable_compliance_core.sql
psql "$DIRECT_URL" -f database/0005_seed_configurable_demo.sql
```

`database/0003_optional_rls.sql` documenta el patrón de Row-Level Security para endurecimiento posterior. No se ejecuta automáticamente porque debe aplicarse después de verificar que todas las operaciones establezcan correctamente el contexto del tenant.

## Rutas principales

| Ruta | Objetivo |
| --- | --- |
| `/app` | Dashboard operativo |
| `/app/inventory` | Lotes, movimientos, ubicaciones y QR |
| `/app/equipment` | Equipos, planes, certificados y QR |
| `/app/education` | Prácticas y reservas educativas |
| `/app/quality` | OOS, OOT y CAPA |
| `/app/documents` | Documentos controlados |
| `/app/logbooks` | Bitácoras electrónicas |
| `/app/training` | Capacitación y competencia |
| `/app/alerts` | Alertas, reglas y escalamiento |
| `/app/compliance` | Matriz simplificada de controles |
| `/app/configuration` | Perfil, campos, alertas, flujos y roles |
| `/app/administration` | Usuarios, permisos, competencia y sesiones |
| `/app/audit` | Audit trail append-only |

## APIs añadidas

| Endpoint | Uso |
| --- | --- |
| `GET /api/configuration` | Consultar configuración activa |
| `POST /api/configuration` | Crear campo personalizado o regla de alerta |
| `GET/POST /api/inventory/movements` | Registrar movimientos con balance calculado |
| `GET/POST /api/equipment/plans` | Gestionar planes periódicos |
| `GET/POST /api/results` | Registrar resultados y abrir OOS automático |
| `GET/PATCH /api/alerts` | Consultar, reconocer, asignar y resolver alertas |
| `GET/POST /api/education/practices` | Consultar y programar prácticas educativas |
| `POST /api/specimens/:id/transitions` | Aplicar transiciones válidas de muestra |
| `GET /api/quality/oos` | Consultar investigaciones OOS |
| `POST /api/signatures` | Registrar firma con reautenticación |
| `GET /api/qr/:token` | Resolver QR opaco después de autenticar |
| `GET /api/compliance` | Consultar controles normativos configurados |

## Documentación agregada

- [`docs/IMPLEMENTED_CONFIGURABLE_LIMS.md`](docs/IMPLEMENTED_CONFIGURABLE_LIMS.md)
- [`docs/COMPLIANCE_BOUNDARIES.md`](docs/COMPLIANCE_BOUNDARIES.md)
- [`docs/ACCEPTANCE_TESTS_CONFIGURABLE_LIMS.md`](docs/ACCEPTANCE_TESTS_CONFIGURABLE_LIMS.md)
- [`docs/MIGRATION_0004.md`](docs/MIGRATION_0004.md)

## Estructura

```text
app/                 Next.js App Router, UI y endpoints
components/          Pantallas y componentes reutilizables
lib/                 Datos demo, sesión, permisos, auditoría y conexión Neon
database/            Esquema, migraciones y semillas
docs/                Arquitectura, cumplimiento, despliegue y validación
scripts/             Verificación local
public/              Identidad visual
```

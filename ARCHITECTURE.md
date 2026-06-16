# NexaLab Educativo - ARCHITECTURE

## 1. Objetivo principal
NexaLab Educativo es el perfil MVP del LISM/NexaLab actual para colegios, universidades y laboratorios pequeños. Su objetivo es controlar inventario, equipos, prácticas, reservas, alertas, QR seguro, roles y auditoría sin activar todavía la complejidad de un LIMS clínico o farmacéutico completo.

Este documento debe guiar a cualquier agente de desarrollo para implementar el módulo educativo sin romper lo ya funcional y sin reescribir el proyecto completo.

## 2. Decisión de arquitectura

### Enfoque recomendado
Mantener el monolito modular actual en **Next.js App Router**.

No separar backend y frontend todavía. Para el MVP educativo, las rutas `app/api/*` son suficientes si se mantiene:

- Separación por dominio.
- Validación con Zod en cada endpoint.
- Guardias de autorización por permiso.
- Escritura de auditoría en acciones críticas.
- Consultas filtradas por `laboratory_id`.
- UI filtrada por rol y perfil de laboratorio.

### Flujo general

```text
Usuario web / celular
  -> Next.js App Router
      -> App Shell filtrado por rol
      -> Componentes de módulo
      -> Route Handlers /api/*
          -> Zod schema
          -> getSession()
          -> hasPermission()
          -> Neon PostgreSQL
          -> writeAuditEvent()
          -> Respuesta JSON normalizada
```

## 3. Stack tecnológico estricto para este proyecto

Usar el stack existente del repositorio salvo que se indique una migración explícita.

- **Framework:** Next.js 16 App Router.
- **UI:** React 19 + TypeScript.
- **Backend:** Next.js Route Handlers en `app/api`.
- **Base de datos:** PostgreSQL en Neon.
- **Acceso a DB:** `@neondatabase/serverless` y SQL migrations actuales.
- **Validación:** Zod.
- **Sesión:** Cookie httpOnly + JWT con `jose`.
- **Contraseñas:** `bcryptjs`.
- **QR:** `qrcode` + tokens opacos + códigos temporales.
- **Iconografía:** `lucide-react`.
- **Despliegue:** Vercel + Neon.

> No introducir Prisma, Drizzle, tRPC, Redux, Zustand, NextAuth, Supabase o NestJS en este MVP sin una decisión explícita. El proyecto actual no los necesita para entregar el perfil educativo.

## 4. Perfil de producto activo

Crear o simular un perfil lógico:

```ts
const ACTIVE_LAB_PROFILE = "EDUCATIONAL_SMALL_LAB";
```

Este perfil debe activar únicamente:

```text
Inicio
Inventario
Equipos
Programa
Alertas
Usuarios
Auditoría
Configuración
```

Y debe ocultar:

```text
Mesa de trabajo
Recepción de muestras
Órdenes
Resultados
Pacientes
Solicitantes
Catálogo de pruebas
Calidad avanzada
Documentos controlados
Bitácoras completas
Competencia
Integraciones
Reportes avanzados
Cumplimiento regulado avanzado
```

No borrar estos módulos. Solo ocultarlos por navegación, permisos y feature flag.

## 5. Módulos funcionales del MVP

### 5.1 Inicio / Dashboard educativo

Debe mostrar KPIs según rol.

#### Administrador
- Prácticas próximas.
- Reservas pendientes.
- Inventario bajo.
- Reactivos vencidos o próximos a vencer.
- Equipos con mantenimiento próximo.
- QR consultados recientemente.
- Acciones críticas recientes.

#### Profesor
- Mis prácticas próximas.
- Mis reservas.
- Recursos faltantes.
- Avisos enviados.
- Alertas asociadas a mis prácticas.

#### Estudiante
- Mi próxima práctica.
- Avisos recientes.
- Instrucciones previas.
- Estado general de la práctica.

### 5.2 Inventario dinámico

Inventario es un solo módulo con submódulos dinámicos basados en `inventory_categories`.

Categorías por defecto:

| Código | Categoría |
| --- | --- |
| `RQ` | Reactivos químicos |
| `RM` | Reactivos microbiológicos |
| `MAT` | Materiales |
| `INS` | Insumos o consumibles |
| `OTR` | Otros |

El administrador puede crear nuevas categorías desde la UI.

#### Regla crítica
El stock no se edita directamente después del alta. Todo cambio se registra con `inventory_movements`.

Movimientos soportados:

- Entrada.
- Salida / consumo.
- Ajuste.
- Devolución.
- Descarte.
- Transferencia.

### 5.3 Reactivos, materiales e insumos

Formulario base:

- Categoría.
- Nombre.
- Fórmula si aplica.
- Fecha de ingreso.
- Ficha de seguridad.
- Código interno automático.
- Lote.
- Proveedor.
- Fecha de vencimiento.
- Ubicación.
- Stock inicial.
- Stock mínimo.
- Unidad.
- Observaciones.
- Campos dinámicos por categoría.

Código interno automático sugerido:

```text
RQ-0001
RM-0001
MAT-0001
INS-0001
OTR-0001
```

### 5.4 Equipos

Debe administrar:

- Código interno.
- Nombre.
- Marca.
- Modelo.
- Serie.
- Ubicación.
- Estado.
- Responsable.
- Frecuencia de mantenimiento.
- Frecuencia de calibración.
- Verificación diaria/semanal/mensual/por uso.
- Certificados o evidencias.
- QR seguro.

Estados permitidos para el MVP:

```text
OPERATIONAL
IN_MAINTENANCE
OUT_OF_SERVICE
IN_CALIBRATION
MAINTENANCE_DUE
```

Si no se desea cambiar el enum actual, mapear visualmente:

- `OPERATIONAL` -> Operativo.
- `MAINTENANCE_DUE` -> Mantenimiento próximo/vencido.
- `OUT_OF_SERVICE` -> Fuera de servicio.
- `RETIRED` -> Inactivo.

### 5.5 Programa / Cronograma

El módulo `Programa` reemplaza el concepto amplio de “Prácticas educativas”.

Debe tener pestañas:

- Cronograma.
- Reservas.
- Avisos.
- Estudiantes / grupos.
- Instrucciones.

Estados de práctica:

```text
DRAFT
PLANNED
PREPARING
READY
EXECUTED
CLOSED
CANCELLED
```

Flujo:

1. Profesor crea práctica.
2. Profesor agrega recursos requeridos.
3. Sistema valida disponibilidad.
4. Se generan reservas.
5. Administrador prepara o confirma recursos.
6. Estudiantes reciben aviso.
7. Se ejecuta práctica.
8. Se registra consumo final.
9. Se cierra práctica.

### 5.6 Alertas

Alertas administrativas:

- Bajo inventario.
- Próximo vencimiento.
- Producto vencido.
- Equipo con mantenimiento próximo.
- Equipo fuera de servicio reservado.
- Reserva pendiente.
- Ficha de seguridad faltante.

Alertas estudiantiles:

- Recordatorio de práctica.
- Cambio de fecha u hora.
- Cambio de laboratorio.
- Instrucciones previas.
- Cancelación o reprogramación.

### 5.7 QR seguro

Cada artículo de inventario y equipo debe tener QR.

Reglas:

- El QR no contiene datos sensibles.
- El QR contiene una URL con token opaco.
- La ficha se muestra solo después de validar código temporal.
- El código temporal vence.
- El código se consume una vez.
- Los intentos fallidos se registran.
- La ficha visible depende del rol o perfil de consulta.

Flujo:

```text
Recurso creado
  -> qr_identifiers
  -> etiqueta imprimible
  -> scan /qr/[token]
  -> código temporal
  -> qr_access_codes
  -> qr_scan_events
  -> ficha limitada
```

## 6. Roles y permisos

### Roles principales

| Rol | Descripción |
| --- | --- |
| `LAB_ADMIN` | Administra todo el laboratorio educativo. |
| `PROFESSOR` | Programa prácticas, solicita reservas y consulta recursos. |
| `STUDENT` | Consulta prácticas, avisos y QR limitado. |

### Matriz mínima

| Permiso | Admin | Profesor | Estudiante |
| --- | --- | --- | --- |
| `inventory.view` | Sí | Sí | Limitado |
| `inventory.manage` | Sí | No | No |
| `inventory.move` | Sí | Opcional | No |
| `equipment.view` | Sí | Sí | Limitado |
| `equipment.manage` | Sí | No | No |
| `education.view` | Sí | Sí | Sí |
| `education.manage` | Sí | Sí | No |
| `configuration.manage` | Sí | No | No |
| `audit.view` | Sí | No | No |

### Riesgo técnico actual

`lib/session.ts` y `lib/authorization.ts` ya contemplan `PROFESSOR` y `STUDENT`, pero el enum inicial de PostgreSQL `membership_role` en `database/0001_init.sql` no los incluye.

Resolver con una de estas opciones:

#### Opción A - Agregar valores al enum

```sql
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'PROFESSOR';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'STUDENT';
```

#### Opción B - Usar `custom_roles`

Mantener `membership_role` base y asignar roles educativos por `custom_role_id`. Esta opción es más flexible para clientes futuros.

## 7. Modelo de datos

### Tablas existentes a reutilizar

- `organizations`
- `laboratories`
- `users`
- `memberships`
- `custom_roles`
- `custom_role_permissions`
- `inventory_categories`
- `inventory_items`
- `inventory_movements`
- `storage_locations`
- `equipment`
- `equipment_plans`
- `equipment_certificates`
- `educational_practices`
- `resource_reservations`
- `alert_rules`
- `alerts`
- `qr_identifiers`
- `qr_access_codes`
- `qr_scan_events`
- `audit_logs`
- `attachments`

### Tablas nuevas recomendadas

```sql
CREATE TABLE IF NOT EXISTS educational_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  academic_period VARCHAR(80),
  teacher_user_id UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS educational_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES educational_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_group VARCHAR(40) NOT NULL DEFAULT 'STUDENT',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS educational_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  practice_id UUID REFERENCES educational_practices(id) ON DELETE CASCADE,
  group_id UUID REFERENCES educational_groups(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(40) NOT NULL DEFAULT 'STUDENTS',
  publish_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 8. Rutas de frontend

```text
/app                         Dashboard educativo
/app/inventory               Inventario dinámico
/app/equipment               Equipos
/app/education               Programa / cronograma
/app/alerts                  Alertas
/app/administration          Usuarios y roles
/app/audit                   Auditoría
/app/configuration           Configuración
/qr/[token]                  Consulta pública protegida por código
```

Para estudiantes, se puede resolver con la misma ruta `/app/education` pero renderizando una vista `StudentEducationView`, o crear alias:

```text
/app/my-practices
/app/student-alerts
```

## 9. Endpoints requeridos

### Existentes

```text
GET    /api/inventory
POST   /api/inventory
GET    /api/equipment
POST   /api/equipment
GET    /api/education/practices
POST   /api/education/practices
GET    /api/alerts
PATCH  /api/alerts
GET    /api/qr/labels
POST   /api/qr/labels
POST   /api/qr/labels/[id]/access-code
POST   /api/public/qr/[token]/verify
```

### Nuevos

```text
GET    /api/inventory/categories
POST   /api/inventory/categories
PATCH  /api/inventory/categories/[id]
GET    /api/inventory/movements
POST   /api/inventory/movements
GET    /api/equipment/plans
POST   /api/equipment/plans
GET    /api/equipment/events
POST   /api/equipment/events
GET    /api/education/reservations
POST   /api/education/reservations
PATCH  /api/education/reservations/[id]
GET    /api/education/groups
POST   /api/education/groups
GET    /api/education/notifications
POST   /api/education/notifications
GET    /api/dashboard/educational
```

## 10. Reglas de negocio críticas

1. Un estudiante nunca puede modificar inventario, equipo, alertas administrativas, usuarios ni configuración.
2. Un profesor puede crear prácticas y reservas, pero no modificar stock directamente salvo permiso explícito.
3. Todo artículo creado debe generar QR automáticamente.
4. Todo equipo creado debe generar QR automáticamente.
5. Todo movimiento de inventario debe guardar auditoría.
6. No permitir movimientos que dejen stock negativo.
7. Un equipo fuera de servicio no puede reservarse sin autorización de administrador.
8. Un reactivo vencido no debe sugerirse para práctica.
9. Los QR públicos nunca deben exponer información sin código temporal.
10. Los códigos temporales QR deben vencer, tener intentos máximos y consumirse una sola vez.

## 11. Variables de entorno

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
SESSION_SECRET="string-largo-seguro"
QR_ACCESS_SECRET="string-largo-seguro-diferente"
NEXT_PUBLIC_APP_URL="https://tudominio.com"
NODE_ENV="production"
```

## 12. Datos demo educativos

Crear seed con al menos:

- 1 administrador.
- 2 profesores.
- 12 estudiantes.
- 3 grupos o cursos.
- 5 reactivos químicos.
- 5 reactivos microbiológicos.
- 8 materiales.
- 8 insumos.
- 8 equipos.
- 6 prácticas programadas.
- 12 reservas de recursos.
- 10 movimientos de inventario.
- 8 alertas.
- QR para todos los recursos principales.

## 13. Criterios de aceptación de arquitectura

- `npm run typecheck` debe pasar.
- `npm run build` debe pasar.
- Ninguna ruta oculta debe aparecer en el menú educativo.
- Las APIs deben bloquear usuarios sin permiso.
- Las consultas deben filtrar por `laboratory_id`.
- Cada acción crítica debe llamar `writeAuditEvent`.
- El QR debe funcionar en modo demo y modo database.
- El estudiante no puede ver datos sensibles.

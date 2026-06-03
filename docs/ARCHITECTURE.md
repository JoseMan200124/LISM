# Arquitectura recomendada

## Decisión inicial: monolito modular

Para empezar con poco presupuesto, la mejor opción no es separar microservicios. NexaLab usa un **monolito modular** en Next.js: una aplicación desplegable, una base PostgreSQL y módulos separados por dominio. Esto reduce costos, simplifica soporte y permite extraer servicios únicamente cuando exista una razón operativa real.

```text
Navegador
   |
   v
Next.js 16 App Router en Vercel
   |-- UI y navegación
   |-- Route handlers / API
   |-- Sesión firmada y autorización
   |
   v
Neon PostgreSQL
   |-- organizaciones y laboratorios
   |-- flujo de muestras y resultados
   |-- inventario y equipos
   |-- calidad, alertas, integraciones y auditoría
```

## Tecnologías

- **Frontend y backend web:** Next.js 16.2.7, React 19 y TypeScript.
- **Base de datos:** Neon PostgreSQL.
- **Conexión:** driver serverless de Neon sobre HTTP para consultas cortas.
- **Autenticación MVP:** contraseña con hash bcrypt y cookie firmada HTTP-only.
- **Validación de entrada:** Zod.
- **Estilos:** CSS propio, sin dependencia de un kit visual pesado.

## Por qué encaja con Vercel y Neon

Las funciones serverless abren conexiones de corta duración. Neon recomienda su driver serverless para aplicaciones JavaScript o TypeScript con cargas variables y recomienda conexiones pooled siempre que sea posible. Para el MVP se utiliza `DATABASE_URL` con host `-pooler`; `DIRECT_URL` queda reservada para migraciones.

## Multiempresa y multilaboratorio

La base tiene tres niveles:

1. `organizations`: cliente comercial o institución.
2. `laboratories`: sedes o laboratorios de una organización.
3. `memberships`: relación entre usuario, laboratorio y rol.

Toda tabla operativa relevante incluye `laboratory_id`. Los route handlers filtran por el laboratorio contenido en la sesión. Antes de una salida productiva con datos sensibles se debe completar la capa de autorización por acción y aplicar RLS con transacciones que establezcan el contexto de tenant. `database/0003_optional_rls.sql` deja el patrón documentado, pero no se aplica automáticamente para evitar una falsa sensación de seguridad.

## Escalamiento gradual

### Fase 1: MVP comercial

- Una app en Vercel.
- Un proyecto Neon.
- Modo demo y pilotos controlados.
- Datos operativos estructurados.

### Fase 2: pilotos reales no clínicos o controlados

- Object storage para adjuntos.
- Servicio de email transaccional.
- Jobs programados para alertas, exportaciones y reposición.
- Logs centralizados, alertas técnicas y backups probados.
- Matriz de permisos por acción.

### Fase 3: operación clínica validada

- RLS endurecido o aislamiento por esquema/proyecto para clientes que lo requieran.
- SSO, MFA, políticas de retención y auditoría avanzada.
- Integraciones HL7/FHIR o ASTM validadas por adaptador.
- Motor de reglas, firma de liberación, control de cambios y pruebas de aceptación documentadas.
- Plan de continuidad, pruebas de restauración y SLA.

## Límites intencionales

- Los archivos grandes, imágenes y PDFs no deben guardarse como blobs en PostgreSQL.
- Los adaptadores de analizadores no deben vivir mezclados con la UI; conviene aislarlos por integración.
- No se introducen colas, Redis o microservicios antes de medir una necesidad concreta.

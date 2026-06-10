# Arquitectura recomendada

## Decisión inicial: monolito modular

NexaLab utiliza un **monolito modular** en Next.js: una aplicación desplegable, una base PostgreSQL y dominios separados. Esto mantiene costos y soporte razonables para un producto inicial, sin impedir separar servicios cuando exista una necesidad medida.

```text
Navegador / PWA
   |
   v
Next.js 16 App Router
   |-- interfaz y navegación filtrada por rol
   |-- route handlers / API
   |-- sesión firmada HTTP-only
   |-- autorización por acción
   |-- validaciones Zod
   |
   v
Neon PostgreSQL
   |-- organizaciones, laboratorios y membresías
   |-- configuración y flujos versionados
   |-- inventario, movimientos y equipos
   |-- muestras, resultados y cadena de custodia
   |-- calidad, alertas, firmas y auditoría
   |-- controles regulatorios y evidencia
```

## Tecnologías

- **Frontend y backend web:** Next.js 16.2.7, React 19 y TypeScript.
- **Base de datos:** PostgreSQL compatible con Neon.
- **Conexión:** driver serverless de Neon.
- **Autenticación base:** bcrypt y cookie firmada HTTP-only.
- **Validación:** Zod.
- **Estilos:** CSS propio.

## Multiempresa y multilaboratorio

La base utiliza:

1. `organizations`: cliente comercial o institución.
2. `laboratories`: sedes o laboratorios.
3. `memberships`: relación entre usuario, laboratorio y rol.

Las tablas operativas incluyen `laboratory_id`, y las APIs filtran por el laboratorio de la sesión. `database/0003_optional_rls.sql` mantiene el patrón inicial para Row-Level Security, pero debe habilitarse únicamente después de probar acceso cruzado y contexto de tenant en todas las operaciones.

## Configuración segura

La flexibilidad se implementa sin degradar trazabilidad:

- datos críticos en columnas estructuradas;
- campos adicionales en definiciones y contenedores JSONB;
- configuraciones versionadas;
- flujos versionados;
- auditoría append-only;
- firmas separadas e inmutables;
- etiquetas QR con token opaco.

## Servicios externos recomendados para producción

- object storage versionado para adjuntos;
- servicio transaccional de correo;
- scheduler y workers para alertas;
- monitoreo y alertas técnicas;
- administración de secretos;
- respaldo y restauración verificable.

## Límites intencionales

- Los archivos grandes no se almacenan como blobs en PostgreSQL.
- Los adaptadores de equipos deben aislarse por integración.
- MFA, RLS, retención e infraestructura deben activarse según riesgo y validarse formalmente.
- El código ayuda al cumplimiento; no sustituye acreditación, SOP ni validación computarizada.

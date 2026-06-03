# Lista de endurecimiento antes de producción

## Estado de esta entrega

La interfaz, el esquema y las APIs iniciales sirven para demostraciones, validación de producto y desarrollo incremental. No constituyen por sí solos un LIS clínico validado.

## Bloqueadores antes de datos reales sensibles

### Seguridad y privacidad

- Definir clasificación de datos y reglas locales aplicables.
- Añadir MFA o SSO para entornos sensibles.
- Implementar política de contraseñas, bloqueo, recuperación segura y rotación.
- Completar autorización por acción, no solo por módulo.
- Aplicar aislamiento reforzado por laboratorio y probar intentos de acceso cruzado.
- Registrar IP, user agent y cambios relevantes en auditoría.
- Cifrar secretos y no exponer `DIRECT_URL` a procesos innecesarios.

### Operación

- Automatizar respaldos y probar restauraciones periódicas.
- Definir RPO, RTO, continuidad y recuperación ante desastres.
- Añadir monitoreo técnico, errores, latencia y alertas.
- Diseñar soporte, escalamiento e incident response.

### Calidad del producto

- Pruebas unitarias, integración, autorización y end-to-end.
- Pruebas de concurrencia y carga.
- Validar reglas de TAT, duplicados y mínimos de inventario.
- Control de cambios y bitácora de versiones.
- Aceptación de usuarios por flujo real de laboratorio.

### Flujo analítico

- Firma o confirmación explícita para validar y liberar resultados.
- Reglas de banderas y valores críticos.
- Impresión y reimpresión trazable de etiquetas.
- Rechazo, transferencia y cadena de custodia.
- Versionado del catálogo y datos maestros con aprobación.
- Integraciones validadas por analizador y receptor externo.

## Orden recomendado

1. Terminar CRUD persistente del flujo principal.
2. Añadir permisos por acción y pruebas de aislamiento.
3. Añadir auditoría completa, backups y restauración.
4. Incorporar pilotos controlados no clínicos.
5. Documentar requisitos regulatorios del mercado objetivo.
6. Validar integraciones, reportes y liberación de resultados.
7. Operar clínicamente únicamente después de aceptación formal.

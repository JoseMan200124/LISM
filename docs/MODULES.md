# Diseño funcional por módulos

## 1. Principio rector

NexaLab se organiza alrededor de trazabilidad continua: cada recepción, movimiento, transición, resultado, alerta, firma y cambio de configuración conserva actor, fecha, laboratorio y evidencia asociada. La interfaz mantiene formularios simples, pero el núcleo evita sobrescribir el historial.

## 2. Núcleo configurable entregado

### Administración y gobernanza

- Organizaciones, sedes y laboratorios.
- Usuarios y roles sugeridos: administrador, jefe de laboratorio, analista, auxiliar, auditor, consulta, profesor y estudiante.
- Permisos por acción y navegación filtrada según rol.
- Centro de configuración con perfiles, campos personalizados, alertas y flujos versionables.
- Centro de cumplimiento con controles, evidencia esperada, responsable y estado.
- Audit trail append-only y firmas electrónicas separadas del registro operativo.

### Recursos

- Inventario por artículo, lote, ubicación y vencimiento.
- Saldo calculado mediante movimientos; no se edita silenciosamente desde formularios.
- Registro obligatorio de uso para reactivos controlados.
- Ubicaciones jerárquicas.
- Equipos, criticidad, planes periódicos, certificados y opción de bloqueo por vencimiento.
- QR opaco: la etiqueta no expone información sensible y aplica permisos después de iniciar sesión.

### Operación

- Registro y consulta de muestras.
- Flujo de muestra configurable por versión mediante estados y transiciones autorizadas.
- Cadena de custodia y transferencias de ubicación.
- Órdenes, catálogo y resultados.
- Resultados vinculables a método y especificación vigentes.
- Apertura automática de investigación OOS cuando un resultado numérico queda fuera de límites.
- Revisión, firma y liberación preparadas como acciones separadas.

### Calidad

- OOS, OOT y CAPA.
- Documentos controlados con versiones históricas.
- Monitoreo ambiental por punto y límites configurables.
- Bitácoras electrónicas con frecuencia y firma opcional.
- Capacitación, competencia y vigencia de autorizaciones.
- Alertas con acuse, asignación, resolución y escalamiento configurable.

### Perfil educativo

- Cronograma de prácticas.
- Reservas de materiales o equipos.
- Avisos previos.
- Consulta limitada para estudiantes.
- Programación de prácticas mediante API para docentes o administradores autorizados.

## 3. Rutas de interfaz

| Ruta | Objetivo |
| --- | --- |
| `/app` | Resumen operativo |
| `/app/inventory` | Inventario, movimientos, ubicaciones y QR |
| `/app/equipment` | Equipos, planes y certificados |
| `/app/education` | Prácticas, reservas y accesos educativos |
| `/app/quality` | OOS, OOT y CAPA |
| `/app/documents` | Documentos controlados |
| `/app/logbooks` | Bitácoras electrónicas |
| `/app/training` | Competencia del personal |
| `/app/alerts` | Alertas, reglas y escalamiento |
| `/app/compliance` | Matriz simplificada de controles |
| `/app/configuration` | Perfiles, campos, reglas, flujos y roles |
| `/app/administration` | Usuarios y sesiones |
| `/app/audit` | Historial de cambios |

## 4. APIs funcionales incluidas

| Endpoint | Uso |
| --- | --- |
| `GET/POST /api/specimens` | Consultar y registrar muestras |
| `POST /api/specimens/:id/transitions` | Ejecutar transición válida del flujo vigente |
| `GET/POST /api/inventory` | Consultar y crear lotes autorizados |
| `GET/POST /api/inventory/movements` | Registrar entradas, consumos, ajustes, transferencias y descartes |
| `GET/POST /api/equipment/plans` | Consultar y crear planes periódicos |
| `GET/POST /api/results` | Registrar resultados y abrir OOS automático |
| `GET/PATCH /api/alerts` | Consultar, reconocer, asignar y resolver alertas |
| `GET/POST /api/education/practices` | Consultar y programar prácticas |
| `POST /api/signatures` | Firmar con reautenticación |
| `GET /api/qr/:token` | Resolver una etiqueta opaca con permisos |
| `GET/POST /api/configuration` | Consultar configuración y crear campos o reglas |
| `GET /api/compliance` | Consultar controles regulatorios |
| `GET /api/quality/oos` | Consultar investigaciones OOS |

## 5. Extensiones productivas pendientes

La base está preparada para continuar sin romper el núcleo. Antes de operar con datos regulados deben completarse object storage para adjuntos, trabajos programados de alertas, MFA según riesgo, RLS validado, pruebas de restauración, validación formal del sistema, SOP internos e integraciones específicas del laboratorio.

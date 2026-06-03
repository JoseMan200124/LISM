# Diseño funcional por módulos

## 1. Principio rector

La experiencia se organiza alrededor del ciclo de la muestra. El usuario no tiene que navegar por pantallas aisladas para entender qué ocurre: el dashboard muestra el estado operativo y cada módulo profundiza únicamente cuando es necesario.

## 2. Capas funcionales

### Preanalítica

- **Recepción de muestras:** ingreso, identificación única, etiqueta o código de barras, tipo de muestra, paciente, prioridad, rechazo y observaciones.
- **Órdenes:** solicitud de pruebas, médico o institución solicitante, estado y prioridad.
- **Pacientes:** perfil único, búsqueda y futura detección de duplicados.
- **Solicitantes:** médicos, instituciones y canales de entrega.
- **Catálogo de pruebas:** datos maestros, área analítica, tipo de muestra, TAT, unidad y código LOINC.

### Analítica

- **Mesa de trabajo:** cola por estación, asignación, prioridad y vencimiento del SLA.
- **Resultados:** captura, revisión, banderas, validación y liberación.
- **Control de calidad:** corridas QC, desviaciones y acciones correctivas.
- **Equipos:** inventario de instrumentos, calibración, mantenimiento y estándares de interfaz.
- **Integraciones:** analizadores, HIS, portal seguro y exportaciones normalizadas.

### Postanalítica

- **Reportes:** operación, TAT, calidad, inventario, vigilancia y auditoría.
- **Alertas e incidencias:** reglas operativas, clasificación, asignación y seguimiento.
- **Auditoría:** actor, acción, entidad, origen y momento exacto.

### Transversales

- **Inventario:** artículos, lotes, ubicaciones, mínimos, vencimientos y movimientos.
- **Administración:** organizaciones, laboratorios, usuarios, membresías y roles.
- **Continuidad:** se documenta la ruta para respaldo, recuperación y observabilidad antes de producción.

## 3. Lo que ya está en el código

| Área | UI demo | Tablas PostgreSQL | API inicial |
| --- | --- | --- | --- |
| Autenticación y roles | Sí | Sí | Sí |
| Dashboard | Sí | Derivable | Salud del sistema |
| Muestras | Sí | Sí | GET / POST |
| Órdenes | Sí | Sí | Preparado en esquema |
| Resultados | Sí | Sí | Preparado en esquema |
| Pacientes y solicitantes | Sí | Sí | Preparado en esquema |
| Catálogo | Sí | Sí | Preparado en esquema |
| Inventario | Sí | Sí | GET / POST |
| Equipos | Sí | Sí | Preparado en esquema |
| Calidad | Sí | Sí | Preparado en esquema |
| Alertas | Sí | Sí | Preparado en esquema |
| Integraciones | Sí | Sí | Preparado en esquema |
| Auditoría | Sí | Sí | Escritura inicial desde API |
| Reportes | Sí | Sí | Preparado en esquema |

## 4. Próximas historias prioritarias

1. Persistir formularios completos de pacientes, órdenes y resultados.
2. Agregar impresión de etiquetas y lectura de código de barras.
3. Implementar firma de validación y liberación de resultados.
4. Añadir movimientos de inventario y reglas automáticas de reposición.
5. Crear bitácoras de mantenimiento y calibración.
6. Definir adaptadores de integración por analizador y por HIS.
7. Añadir almacenamiento de documentos en un servicio de objetos, nunca en la base de datos.
8. Incorporar permisos por acción y aislamiento reforzado por laboratorio.

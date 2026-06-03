# Trazabilidad de investigación y diseño funcional

Este documento explica cómo las recomendaciones del material consultado se tradujeron en módulos concretos del MVP. El objetivo no es aparentar que un prototipo ya es un LIS clínico validado, sino dejar una base ordenada para implementar y probar cada capacidad de forma incremental.

## 1. Fuentes guía

- APHL, *Laboratory Information Systems Project Management: A Guidebook for International Implementations* (2019): https://aphl.org/docs/default-source/technical/GH-2019May-LIS-Guidebook-web.pdf
- APHL, *Laboratory Information System (LIS) Integration Guide* (2024): https://aphl.org/aboutAPHL/publications/Documents/PHPR-2024-LIS-Integration-Guide.pdf
- Labguru, páginas públicas de ELN, LIMS e Inventory: https://www.labguru.com/
- LabArchives, Inventory y precios públicos: https://www.labarchives.com/products/inventory

## 2. Flujo de la muestra

APHL plantea que la información debe acompañar a la muestra durante las fases preanalítica, analítica y postanalítica. NexaLab utiliza ese flujo como estructura principal de experiencia de usuario.

| Fase | Recomendación identificada | Implementación en el MVP | Siguiente endurecimiento |
| --- | --- | --- | --- |
| Preanalítica | Registro, identificación única, código de barras, trazabilidad, paciente, solicitante y orden | `patients`, `providers`, `orders`, `specimens`, `specimen_types`, pantalla de muestras y modal de acceso | Impresión de etiquetas, detección de duplicados, cadena de custodia y rechazo completo |
| Analítica | Cola de pruebas, transferencia de datos, captura, QC, validación y liberación | `order_tests`, `result_records`, `quality_control_records`, mesa de trabajo, resultados, equipos e integraciones | Firma de validación, reglas críticas, adaptadores ASTM/HL7 y pruebas con equipos reales |
| Postanalítica | Reportes, distribución, almacenamiento de resultados, intercambio y auditoría | `report_definitions`, `audit_logs`, alertas, reportes e integraciones | Portal seguro, exportaciones programadas, retención, firma y vigilancia epidemiológica validada |

## 3. Datos maestros y estándares

El esquema deja espacio explícito para datos maestros administrables:

- Catálogo de pruebas mediante `test_catalog`.
- Tipos de muestra mediante `specimen_types`.
- Áreas analíticas mediante `departments`.
- Códigos normalizados como `loinc_code`.
- Estándares de equipo e integración mediante `interface_standard` y `standard_name`.

En fases posteriores deben versionarse catálogos, unidades, rangos de referencia, reglas clínicas y códigos normalizados. Los cambios deben pasar por aprobación y dejar evidencia.

## 4. Inventario y equipos

La investigación de referentes comerciales muestra que el inventario no debe ser una lista plana. Debe contemplar ubicación, lote, vencimiento, mínimos, consumos, trazabilidad y relación con equipos.

El MVP incluye:

- `storage_locations` jerárquicas.
- `inventory_categories`, `inventory_items` e `inventory_movements`.
- Lotes, fechas de vencimiento, punto de reposición y unidad de medida.
- `equipment` y `equipment_events` para mantenimientos, calibraciones e indisponibilidad.

## 5. Alertas, calidad y auditoría

APHL destaca reglas, alertas, control de calidad, respaldo y monitoreo. El MVP separa:

- Alertas operativas en `alerts`.
- Registros de QC en `quality_control_records`.
- Evidencia de acciones en `audit_logs`.
- Solicitudes de cambio en `change_requests`.

En producción se requiere un motor de reglas probado, escalamiento de alertas, bitácora completa de cambios y procedimientos documentados.

## 6. Arquitectura de bajo costo con ruta de escalamiento

El MVP usa un monolito modular porque permite lanzar una primera versión comercial con pocos recursos sin bloquear la evolución futura:

```text
Next.js App Router en Vercel
        |
        v
Route handlers con validación Zod
        |
        v
Neon PostgreSQL multiempresa y multilaboratorio
```

Cuando exista demanda real se pueden separar integraciones, procesos programados, documentos, notificaciones y analítica pesada sin reescribir el núcleo de dominio.

## 7. Capacidades deliberadamente no declaradas como terminadas

- Cumplimiento normativo específico de un país.
- Validación clínica.
- Integraciones productivas con instrumentos.
- Firma electrónica avanzada.
- MFA, SSO y políticas de identidad corporativas.
- Almacenamiento documental y retención legal.
- Backups probados, recuperación, RPO, RTO y SLA.
- Aislamiento reforzado por tenant con RLS aplicado y probado.

Estas capacidades aparecen en el roadmap y en la lista de endurecimiento, pero no deben prometerse comercialmente como completas hasta validarlas.

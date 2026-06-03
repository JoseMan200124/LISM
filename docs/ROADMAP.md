# Roadmap de producto

## Objetivo

Convertir el MVP demostrable en un SaaS vendible primero para universidades y laboratorios de investigación, y después en una plataforma apta para pilotos operativos controlados. La operación clínica exige una fase adicional de validación, seguridad y cumplimiento.

## Fase 0 — Entrega actual

Incluye diseño profesional responsivo, modo demo, navegación integral, sesión firmada, esquema Neon multiempresa y multilaboratorio, SQL semilla, APIs iniciales de muestras e inventario, auditoría inicial y documentación de despliegue.

## Fase 1 — Producto comercial para universidades e investigación

Duración orientativa: 4 a 8 semanas.

- CRUD persistente para pacientes, solicitantes, órdenes, muestras, catálogo, inventario y equipos.
- Etiquetas con código de barras o QR.
- Movimientos de inventario con responsable y motivo.
- Adjuntos en object storage.
- Exportación CSV y PDF de reportes no clínicos.
- Administración de usuarios, laboratorios y membresías.
- Emails transaccionales para alertas básicas.
- Pruebas end-to-end de los flujos principales.

## Fase 2 — Pilotos operativos controlados

Duración orientativa: 6 a 12 semanas.

- Captura y revisión de resultados con historial.
- Firma explícita para validación y liberación.
- Reglas de valores críticos y SLA de TAT.
- QC completo con acciones correctivas.
- Bitácora de mantenimiento y calibración.
- Control de cambios de datos maestros.
- Permisos por acción y pruebas de acceso cruzado.
- RLS o estrategia reforzada de aislamiento por tenant.
- Backups, restauración probada, observabilidad y respuesta ante incidentes.

## Fase 3 — Integraciones y operación regulada

Duración orientativa: depende del mercado, equipos y requerimientos contractuales.

- Adaptadores de analizadores por fabricante y protocolo.
- Integraciones HIS mediante HL7/FHIR o formatos acordados.
- Portal seguro para distribución de resultados.
- SSO, MFA y políticas de identidad.
- Retención, privacidad y acuerdos de procesamiento de datos.
- Validación formal, UAT documentada, SOPs, continuidad y SLA.
- Revisión legal y regulatoria por país y tipo de laboratorio.

## Orden comercial recomendado

1. Presentar la interfaz actual como prototipo funcional.
2. Vender pilotos pagados de investigación o gestión de inventario.
3. Medir qué módulos generan mayor valor y soporte.
4. Financiar integraciones y validación mediante onboarding y servicios profesionales.
5. No prometer operación clínica hasta completar la fase de endurecimiento correspondiente.

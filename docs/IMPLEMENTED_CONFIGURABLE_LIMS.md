# Implementación configurable de NexaLab LIMS

## 1. Objetivo

La ampliación evita construir formularios rígidos. NexaLab ofrece un núcleo común y permite adaptar perfiles, campos, alertas, flujos y roles sin modificar el código para cada cliente.

## 2. Núcleo común

Disponible para todos los perfiles:

- Usuarios, roles y sesiones.
- Inventario, lotes, movimientos y ubicaciones.
- Equipos, planes y certificados.
- Muestras, órdenes, resultados y reportes.
- Alertas e incidencias.
- Audit trail.
- QR opaco.
- Configuración versionada.

## 3. Perfiles incluidos

| Perfil | Uso sugerido | Funciones iniciales |
| --- | --- | --- |
| Educativo y universitario | Docencia | Prácticas, reservas, docentes y estudiantes de consulta. |
| Farmacéutico y control de calidad | Operación regulada | Métodos, especificaciones, OOS/OOT, CAPA, documentos y firmas. |
| Clínico y hospitalario | Laboratorios clínicos | Pacientes, órdenes, recepción, valores críticos y liberación. |
| Alimentos y agua | Ensayos sanitarios | Muestreo, microbiología, fisicoquímica, tendencias y reportes. |
| Industrial | Control de proceso | Lotes, especificaciones, equipos y certificados. |
| Calibración | Metrología | Patrones, planes, certificados y trazabilidad metrológica. |

## 4. Campos personalizados

La tabla `custom_field_definitions` permite agregar información por módulo. Cada definición registra:

- módulo;
- clave estable;
- etiqueta visible;
- tipo de dato;
- obligatoriedad;
- condición;
- validación;
- visibilidad;
- inclusión en reporte;
- inclusión en QR;
- orden;
- versión de configuración.

Los datos críticos siguen usando columnas normales. Los campos variables se conservan en `custom_values JSONB` dentro de entidades seleccionadas.

## 5. Flujos versionados

Las tablas `workflow_definitions`, `workflow_versions`, `workflow_states` y `workflow_transitions` permiten publicar procesos estables.

Cada transición puede exigir:

- roles autorizados;
- campos obligatorios;
- justificación;
- firma;
- automatización;
- cambio de estado trazable.

La API `POST /api/specimens/:id/transitions` aplica transiciones válidas y registra el cambio en auditoría.

## 6. Inventario por movimientos

El inventario no debe editarse escribiendo un nuevo saldo. Se registra un movimiento:

- recepción;
- consumo;
- ajuste;
- transferencia;
- descarte.

El trigger `trg_apply_inventory_movement` bloquea saldos negativos y guarda saldo anterior y resultante. Los reactivos marcados con `requires_usage_log` exigen indicar el uso o la práctica relacionada.

## 7. Equipos

La tabla `equipment_plans` admite planes independientes de:

- verificación;
- limpieza;
- calibración;
- mantenimiento;
- calificación.

Un plan puede bloquear el uso cuando está vencido. `equipment_certificates` conserva proveedor, fechas, alcance, incertidumbre y adjunto.

## 8. Resultados y OOS

La API `POST /api/results` permite:

1. registrar resultado;
2. asociar versión de método;
3. asociar versión de especificación;
4. conservar datos crudos;
5. detectar límites numéricos;
6. abrir una investigación OOS automática;
7. generar una alerta crítica;
8. escribir evidencia en auditoría.

Un reanálisis debe crear una revisión o un registro relacionado; nunca sobrescribir silenciosamente el valor original.

## 9. Firma electrónica

`electronic_signatures` conserva:

- firmante;
- registro firmado;
- significado;
- hash del contenido;
- método de autenticación;
- momento;
- correlación.

La API `POST /api/signatures` solicita reautenticación. En una operación productiva debe añadirse MFA según la evaluación de riesgo.

## 10. Alertas

`alert_rules` permite reglas por fecha, umbral, evento, ausencia de actividad o resultado. Cada regla puede definir:

- severidad;
- destinatarios;
- canales;
- escalamiento;
- repetición;
- acuse requerido.

La interfaz incluye plantillas claras y permite agregar reglas adicionales en modo demo mediante almacenamiento local.

## 11. Calidad

Se incorporan estructuras para:

- OOS;
- OOT;
- CAPA;
- documentos controlados;
- versiones documentales;
- monitoreo ambiental;
- bitácoras electrónicas;
- competencia del personal;
- evidencia regulatoria.

## 12. Auditoría

`audit_logs` añade:

- valor anterior;
- valor nuevo;
- motivo;
- IP;
- user agent;
- sesión;
- identificador de correlación;
- hash opcional.

Un trigger bloquea actualizaciones y eliminaciones.

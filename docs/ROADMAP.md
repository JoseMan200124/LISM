# Roadmap de producto

## Estado entregado

La versión incluida ya supera un prototipo visual. Incorpora un núcleo LIMS configurable, esquema PostgreSQL ampliado, modo demostración, autorización por roles, rutas operativas y APIs iniciales para los flujos prioritarios.

### Implementado en esta entrega

- Perfiles por tipo de laboratorio.
- Campos personalizados y configuración versionable.
- Roles sugeridos y permisos por acción.
- Navegación restringida según rol.
- Inventario por lote y movimientos con saldo calculado.
- Reactivos controlados con registro obligatorio de uso.
- Equipos, planes periódicos, certificados y opción de bloqueo.
- QR opaco con verificación posterior al inicio de sesión.
- Muestras, cadena de custodia y transiciones configurables.
- Métodos y especificaciones versionadas en base de datos.
- Resultados con detección OOS inicial.
- OOS, OOT, CAPA, documentos, bitácoras, ambiental y competencia.
- Alertas con reconocimiento, asignación y resolución.
- Prácticas y reservas educativas.
- Audit trail append-only, inicio y cierre de sesión auditables y firmas vinculadas.
- Matriz de controles y evidencia regulatoria.

## Próxima etapa: piloto controlado

Antes de utilizar datos reales sensibles o regulados:

1. Aplicar migraciones en un entorno PostgreSQL de pruebas y ejecutar UAT con usuarios del laboratorio.
2. Configurar object storage versionado para fichas, certificados, POE y evidencia.
3. Implementar jobs programados para fechas de vencimiento, calibraciones, omisiones y escalamiento.
4. Activar correo transaccional y definir plantillas de notificación.
5. Completar administración persistente de roles personalizados y aprobación de versiones de configuración.
6. Probar aislamiento de tenants y habilitar RLS únicamente cuando cada operación establezca el contexto correcto.
7. Añadir exportaciones controladas y reportes PDF versionados.
8. Ejecutar pruebas de respaldo y restauración documentadas.

## Etapa regulada

La salida regulada requiere validación formal, no únicamente desarrollo:

- matriz URS → riesgo → prueba → evidencia;
- SOP de operación y soporte;
- control de cambios;
- capacitación;
- MFA y políticas de identidad según riesgo;
- retención y continuidad;
- revisión legal y normativa según sector y país;
- aprobación del laboratorio.

## Vertical clínico

Para operación clínica real deben completarse privacidad, valores críticos con comunicación trazable, remisiones, POCT, interoperabilidad y reglas específicas del alcance del laboratorio.

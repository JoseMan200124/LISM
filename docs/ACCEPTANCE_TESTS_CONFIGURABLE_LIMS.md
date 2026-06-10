# Pruebas de aceptación recomendadas

## Configuración

1. Crear un campo adicional en reactivos y verificar que aparece como borrador.
2. Publicar una nueva versión y confirmar que los registros históricos mantienen su estructura original.
3. Cambiar el perfil del laboratorio y verificar la visibilidad de módulos.
4. Crear una alerta personalizada y comprobar que queda asociada al laboratorio correcto.

## Inventario

5. Registrar recepción y confirmar saldo anterior y resultante.
6. Intentar consumir más cantidad que la disponible y comprobar el bloqueo.
7. Consumir un reactivo controlado sin nota y comprobar que se exige uso o práctica.
8. Verificar sugerencia FEFO cuando existen lotes con distintos vencimientos.
9. Escanear QR y comprobar que no expone datos antes de iniciar sesión.

## Equipos

10. Crear plan de calibración con alertas 90, 60, 30 y 0 días.
11. Marcar el plan como bloqueante y comprobar que un equipo vencido no puede asignarse a un análisis.
12. Adjuntar certificado y verificar versión, hash y proveedor.

## Muestras

13. Registrar muestra y generar número único.
14. Aplicar transición válida y confirmar auditoría.
15. Intentar una transición inválida y comprobar el rechazo.
16. Rechazar una muestra sin motivo y comprobar la validación.
17. Transferir ubicación y verificar cadena de custodia.

## Resultados y calidad

18. Registrar resultado dentro de especificación.
19. Registrar resultado fuera de especificación y confirmar alerta crítica e investigación OOS.
20. Crear revisión sin borrar el resultado inicial.
21. Cerrar investigación con firma.
22. Comprobar que una CAPA mantiene responsable, fecha y evidencia de efectividad.

## Documentos y firmas

23. Crear documento, aprobar versión y marcar una versión anterior como obsoleta.
24. Verificar que una versión obsoleta continúa visible para auditoría.
25. Firmar con contraseña incorrecta y comprobar el rechazo.
26. Firmar correctamente y verificar que la firma no puede modificarse ni eliminarse.

## Seguridad y auditoría

27. Verificar segregación entre laboratorios.
28. Bloquear un usuario y confirmar que no puede iniciar sesión.
29. Verificar captura de valor anterior, valor nuevo, motivo y usuario.
30. Intentar actualizar o eliminar un evento de auditoría y comprobar el bloqueo.
31. Restaurar un respaldo en un entorno de prueba y registrar el resultado.

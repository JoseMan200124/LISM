# NexaLab Educativo - DESIGN_RULES

## 1. Principio de diseño
La interfaz debe sentirse simple, clara y confiable para personal de laboratorio, profesores y estudiantes. El usuario no debe sentir que está usando un sistema corporativo pesado, sino una herramienta ordenada, visual y fácil de entender.

Inspiración funcional:

- WhatsApp: claridad y mensajes directos.
- Excel: tablas fáciles de leer.
- Google Calendar: cronograma simple.
- Linear/Apple: limpieza visual, buen espacio y acciones claras.

## 2. Estilo visual

### Vibe

- Minimalista.
- Profesional.
- Educativo.
- Limpio.
- Sin saturación de botones.
- Español claro.

### Colores recomendados

Mantener identidad NexaLab con verde/teal.

```css
--background: #F7FAF9;
--surface: #FFFFFF;
--surface-muted: #EEF5F3;
--primary: #0F4F49;
--primary-soft: #D7ECE6;
--text: #173B3F;
--text-muted: #647477;
--border: #CAD7D5;
--danger: #B42318;
--warning: #B54708;
--success: #027A48;
```

Si se conserva el tema actual del proyecto, no hacer rediseño total. Ajustar por módulos.

## 3. Reglas de layout

- Máximo 1 acción primaria por bloque visual.
- Usar tarjetas para KPIs.
- Usar tablas para inventario, equipos y reservas.
- Usar tabs para submódulos.
- Usar modales solo para creación rápida.
- Usar páginas dedicadas si el formulario crece demasiado.
- Evitar pantallas con más de 3 grupos de botones.

## 4. Navegación por rol

### Administrador

```text
Inicio
Inventario
Equipos
Programa
Alertas
Usuarios
Auditoría
Configuración
```

### Profesor

```text
Inicio
Programa
Reservas
Inventario consulta
Equipos consulta
Alertas
```

### Estudiante

```text
Inicio
Mis prácticas
Avisos
Consulta QR
```

Nunca mostrar al estudiante módulos administrativos aunque el endpoint también lo bloquee.

## 5. Dashboard

### Administrador

Tarjetas:

- Prácticas próximas.
- Reservas pendientes.
- Bajo inventario.
- Reactivos por vencer.
- Equipos por mantener.
- QR consultados.

Debajo:

- Tabla de alertas críticas.
- Lista de próximas prácticas.
- Acciones rápidas.

### Profesor

Tarjetas:

- Mis prácticas esta semana.
- Reservas pendientes.
- Recursos faltantes.
- Avisos enviados.

### Estudiante

Tarjetas simples:

- Próxima práctica.
- Avisos.
- Instrucciones pendientes.

No mostrar métricas de inventario interno a estudiantes.

## 6. Inventario

### Layout

```text
Header: Inventario
Descripción corta
Acciones: Nuevo artículo / Registrar movimiento / Escanear QR

KPIs:
- Total artículos
- Por reponer
- Próximos a vencer

Tabs:
Todos | Reactivos químicos | Reactivos microbiológicos | Materiales | Insumos | Otros | + Categoría

Tabla:
Código | Nombre | Categoría | Lote | Ubicación | Stock | Vence | Estado | Acciones
```

### Estados visuales

| Estado | Color |
| --- | --- |
| Disponible | Verde suave |
| Vigilar | Amarillo suave |
| Reponer | Naranja suave |
| Vencido | Rojo suave |
| Restringido | Gris/rojo suave |

### Formulario de nuevo artículo

Orden de campos:

1. Categoría.
2. Nombre.
3. Fórmula si aplica.
4. Fecha de ingreso.
5. Lote.
6. Fecha de vencimiento.
7. Ubicación.
8. Cantidad inicial.
9. Unidad.
10. Stock mínimo.
11. Proveedor.
12. Ficha de seguridad.
13. Campos dinámicos.

Mostrar el código interno como vista previa:

```text
Código sugerido: RQ-0007
```

## 7. Equipos

### Layout

```text
Header: Equipos
Acciones: Nuevo equipo / Registrar evento / Escanear QR

KPIs:
- Equipos activos
- En mantenimiento
- Fuera de servicio
- Próxima calibración

Tabs:
Registro maestro | Planes | Certificados | QR

Tabla:
Código | Equipo | Ubicación | Estado | Próx. mantenimiento | Responsable | Acciones
```

### Estados de equipo

| Estado | UI |
| --- | --- |
| Operativo | Badge verde |
| En mantenimiento | Badge amarillo |
| En calibración | Badge azul |
| Fuera de servicio | Badge rojo |
| Inactivo | Badge gris |

## 8. Programa / Cronograma

### Layout

```text
Header: Programa
Acciones: Nueva práctica / Nuevo aviso

KPIs:
- Prácticas próximas
- Reservas pendientes
- Estudiantes visibles

Tabs:
Cronograma | Reservas | Avisos | Estudiantes | Instrucciones
```

### Cronograma

Debe poder verse como:

- Lista semanal simple.
- Tabla por fecha.
- Filtro por curso.
- Filtro por profesor.

Tabla:

```text
Código | Práctica | Curso | Profesor | Fecha | Recursos | Estado
```

### Estados de práctica

| Estado | UI |
| --- | --- |
| Borrador | Gris |
| Programada | Azul |
| En preparación | Amarillo |
| Lista | Verde |
| Ejecutada | Verde oscuro |
| Cerrada | Gris oscuro |
| Cancelada | Rojo |

## 9. Reservas

Una reserva debe mostrar:

- Práctica asociada.
- Recurso.
- Tipo de recurso.
- Cantidad solicitada.
- Cantidad aprobada.
- Fecha requerida.
- Estado.
- Responsable.

Estados:

```text
PENDING
APPROVED
PREPARING
READY
PARTIAL
REJECTED
CONSUMED
RETURNED
CANCELLED
```

## 10. Avisos para estudiantes

Los avisos deben verse como tarjetas simples.

Cada aviso debe mostrar:

- Título.
- Práctica relacionada.
- Fecha.
- Mensaje.
- Prioridad.
- Estado leído/no leído.

No usar lenguaje técnico. Ejemplo:

```text
Mañana tienes práctica de tinción de Gram.
Revisa la guía antes de llegar al laboratorio.
```

## 11. QR seguro

### Etiqueta imprimible

Debe mostrar únicamente:

- Logo NexaLab.
- Tipo de recurso.
- Código interno.
- Nombre corto.
- QR.
- Texto: “Escanea e ingresa código temporal”.

No mostrar en la etiqueta:

- Stock.
- Lote.
- Ubicación exacta sensible.
- Historial.
- Responsable interno.

### Pantalla pública `/qr/[token]`

Antes de validar:

- Logo.
- Mensaje de seguridad.
- Campo de 6 dígitos.
- Botón “Consultar etiqueta”.

Después de validar:

- Nombre.
- Código.
- Estado general.
- Ubicación autorizada.
- Resumen permitido.
- Historial limitado si aplica.

## 12. Tablas

Reglas:

- Encabezados visibles.
- Filas con buen espaciado.
- Badges para estados.
- Acciones al final.
- No más de 8 columnas visibles en móvil.
- En móvil usar cards o tabla horizontal con scroll.

## 13. Modales

Usar modales para:

- Crear categoría rápida.
- Registrar movimiento rápido.
- Generar código QR.
- Confirmar reserva.
- Publicar aviso corto.

No usar modal para formularios largos de equipos o prácticas complejas.

## 14. Cargas y errores

### Carga

No usar texto plano “Cargando...” como única señal. Usar skeletons o tarjetas placeholder.

### Error

Errores deben ser útiles:

Malo:

```text
Error 500
```

Bueno:

```text
No fue posible guardar el artículo. Revisa los campos obligatorios e intenta nuevamente.
```

## 15. Accesibilidad

- Contraste suficiente.
- Botones con texto e icono, no solo icono.
- Inputs con label visible.
- Estados no dependen solo del color.
- Navegación con teclado.
- QR con texto alternativo.
- Mensajes de error asociados al campo.

## 16. Responsive

Prioridad móvil:

- QR público.
- Mis prácticas.
- Avisos.
- Consulta de equipo/inventario.

Prioridad desktop:

- Inventario completo.
- Equipos.
- Configuración.
- Auditoría.

## 17. Copywriting

Usar frases cortas.

Preferir:

```text
Nuevo artículo
Registrar movimiento
Generar código temporal
Práctica lista
Reserva pendiente
```

Evitar:

```text
Ejecutar procedimiento de administración de recursos laboratoriales
```

## 18. Checklist visual antes de entregar

- [ ] El estudiante no ve menús administrativos.
- [ ] El profesor no ve configuración ni auditoría.
- [ ] El administrador entiende qué debe atender primero.
- [ ] Los estados tienen badge claro.
- [ ] Las tablas no se ven saturadas.
- [ ] El QR público se entiende en celular.
- [ ] Los formularios tienen labels y errores claros.
- [ ] No hay botones sin función.
- [ ] No hay spinners genéricos como única carga.
- [ ] El diseño conserva identidad NexaLab.

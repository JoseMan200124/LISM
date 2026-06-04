# Criterios UI, UX y CX

## Objetivo de diseño

NexaLab debe sentirse como una herramienta científica de operación diaria: precisa, sobria y fácil de recorrer durante turnos con carga alta. La interfaz evita el aspecto genérico de un CRM corporativo y prioriza una lectura rápida del estado de las muestras, las alertas y las acciones pendientes.

## Dirección visual aplicada

### Paleta principal

La interfaz utiliza una paleta inspirada en superficies clínicas, vidrio de laboratorio y tonos minerales. El color blanco domina la experiencia y los tonos de apoyo se reservan para orientación y estado.

| Rol visual | Color | Uso |
|---|---|---|
| Blanco clínico | `#FFFFFF` | Sidebar, barra superior, tarjetas, formularios y modales |
| Fondo estéril | `#F7F9F7` | Lienzo general con contraste muy suave |
| Verde mineral | `#216D66` | Acción primaria, navegación activa, vínculos e iconos funcionales |
| Verde mineral suave | `#E9F4F1` | Fondos discretos para elementos seleccionados |
| Verde salvia | `#4F806B` | Confirmaciones y estados favorables |
| Ocre cálido | `#B7782D` | Advertencias que requieren seguimiento |
| Rojo arcilla | `#B5554D` | Errores, urgencias y alertas críticas |
| Grafito clínico | `#20343A` | Texto principal de alta legibilidad |

La paleta evita saturar cada módulo con un color distinto. El usuario reconoce primero la estructura, luego la prioridad y finalmente el detalle.

### Componentes refinados

- Sidebar blanco con borde sutil y una línea mineral de 2 px en la sección activa.
- Barra superior blanca y limpia, con una sola acción primaria persistente: **Nueva muestra**.
- Tarjetas con bordes suaves y sombras casi imperceptibles.
- Iconos lineales pequeños y contextuales para muestras, equipos, inventario, calidad, reportes e integraciones.
- Identidad visual con un matraz lineal en lugar de una letra dentro de un recuadro genérico.
- Selector de laboratorio con icono de microscopio y fondo neutro.
- Login claro con fondo clínico muy sutil, sin bloques oscuros pesados.

## Principios aplicados

### 1. La muestra es el eje de navegación

El usuario entiende el trabajo mediante el recorrido de la muestra: recepción, preparación, análisis, validación y liberación. El dashboard presenta esa secuencia antes que métricas aisladas.

### 2. Atención primero, análisis después

Las alertas activas, vencimientos y validaciones prioritarias aparecen en el resumen operativo. Los tonos ocre y rojo arcilla se utilizan únicamente cuando existe una acción pendiente o una condición crítica.

### 3. Blanco predominante y color funcional

La estructura del sistema depende de espacios en blanco, bordes discretos y jerarquía tipográfica. El verde mineral funciona como hilo conductor y no como decoración. Esto reduce ruido visual durante jornadas operativas largas.

### 4. Divulgación progresiva

Cada módulo presenta tres indicadores y una tabla limpia. Los detalles, formularios y acciones secundarias se abren únicamente cuando son necesarios. Esto evita mostrar demasiada información al mismo tiempo.

### 5. Iconografía mínima y representativa

Los iconos se utilizan para acelerar el reconocimiento visual, no para decorar. La navegación mantiene símbolos lineales simples para operaciones como escaneo, órdenes, resultados, pacientes, inventario, equipos, calidad, reportes y auditoría.

### 6. Consistencia operativa

- Búsqueda global en la barra superior.
- Acción principal persistente para registrar una nueva muestra.
- Estados mediante etiquetas uniformes.
- Prioridades distinguibles por texto y color.
- Tablas preparadas para filtros y paginación.

### 7. Diseño responsivo

La interfaz reduce columnas, compacta acciones y transforma la navegación lateral en menú móvil cuando el ancho disponible disminuye.

## Pantallas incluidas

- Login profesional.
- Dashboard operativo.
- Mesa de trabajo.
- Muestras.
- Órdenes.
- Resultados.
- Pacientes.
- Solicitantes.
- Catálogo de pruebas.
- Inventario.
- Equipos.
- Control de calidad.
- Alertas.
- Reportes.
- Integraciones.
- Auditoría.
- Administración.
- Modal de nueva muestra.

## Próximas validaciones UX recomendadas

1. Probar el flujo de recepción con personal real de laboratorio.
2. Medir el tiempo para registrar, buscar y rechazar una muestra.
3. Confirmar qué filtros se utilizan diariamente.
4. Validar la lectura de alertas y valores críticos sin depender únicamente del color.
5. Adaptar vocabulario a cada mercado y tipo de laboratorio.

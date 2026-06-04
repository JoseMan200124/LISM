# Landing page de NexaLab LIS

## Objetivo

La página pública presenta NexaLab como una solución LIS clara, profesional y fácil de adoptar. La jerarquía está pensada para explicar el valor del producto antes de exponer demasiados módulos o detalles técnicos.

## Decisiones UI/UX

- Predominio de blanco clínico para comunicar orden y reducir ruido visual.
- Verde mineral reservado para acciones principales, iconos y acentos funcionales.
- Encabezado compacto con tres anclas de navegación e ingreso visible.
- Hero con propuesta de valor directa y una vista previa construida con CSS para evitar imágenes pesadas.
- Bloques breves para explicar beneficios, flujo preanalítico-analítico-postanalítico y capacidades esenciales.
- Dos llamadas principales a la acción: `Explorar plataforma` y `Explorar demo`, ambas dirigidas al login demostrativo.
- Responsive design sin navegación móvil compleja: se prioriza el acceso al demo.
- Estados de foco visibles y compatibilidad con `prefers-reduced-motion`.

## Archivos principales

```text
app/page.tsx
app/layout.tsx
app/globals.css
components/landing-page.tsx
```

## Ruta pública

```text
/
```

El acceso autenticado se mantiene en:

```text
/app
```

El login se mantiene en:

```text
/login
```

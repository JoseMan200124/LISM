# Corrección de instalación en Vercel

## Problema detectado

El `package-lock.json` inicial contenía URLs `resolved` de un registro interno usado durante la generación del proyecto. Esas URLs no son accesibles desde Vercel y la instalación se quedaba esperando hasta terminar con `npm error Exit handler never called!`.

Además, `package.json` declaraba `node >=20.9.0`. En Vercel, un rango abierto puede resolverse automáticamente al Node.js disponible más reciente. Se cambió a `22.x` para usar una versión principal estable y soportada.

## Archivos modificados

- `package.json`
- `package-lock.json`
- `.npmrc`
- `vercel.json`

## Pasos

Sube estos archivos al repositorio y vuelve a desplegar. No debes configurar un Install Command manual en el panel de Vercel porque `vercel.json` ya usa:

```bash
npm ci --no-audit --no-fund
```

Para verificar antes de subir:

```bash
npm ci
npm run typecheck
npm run build
```

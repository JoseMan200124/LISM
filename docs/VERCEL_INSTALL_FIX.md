# Corrección de instalación en Vercel

## Problema detectado

El despliegue quedaba detenido durante varios minutos en:

```bash
npm ci --no-audit --no-fund
```

Finalmente terminaba con:

```text
npm error Exit handler never called!
```

La causa encontrada en el proyecto era que `package-lock.json` todavía contenía varias URLs `resolved` de un registro interno de generación. Ese host no es accesible desde Vercel. Aunque parte del lockfile ya apuntaba a `registry.npmjs.org`, quedaban dependencias transitivas con URLs internas.

## Corrección aplicada

- Todas las URLs `resolved` del lockfile apuntan ahora a `https://registry.npmjs.org/`.
- Se añadió `.npmrc` para declarar explícitamente el registro público.
- Se añadió `scripts/check-public-lockfile.mjs` para detectar futuros lockfiles contaminados antes de instalar dependencias.
- `vercel.json` valida el lockfile y ejecuta una instalación reproducible con `npm ci`.

## Archivos modificados

- `.npmrc`
- `package-lock.json`
- `vercel.json`
- `scripts/check-public-lockfile.mjs`
- `docs/VERCEL_INSTALL_FIX.md`

## Validación local

```bash
node scripts/check-public-lockfile.mjs
rm -rf node_modules .next
npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund --prefer-online
npm run typecheck
npm run build
```

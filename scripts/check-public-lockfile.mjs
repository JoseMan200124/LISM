import { readFileSync } from "node:fs";

const lockfile = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");
const forbiddenHosts = [
  "packages.applied-caas-gateway1.internal.api.openai.org",
  "artifactory/api/npm/npm-public",
];

const detected = forbiddenHosts.filter((host) => lockfile.includes(host));

if (detected.length > 0) {
  console.error("ERROR: package-lock.json contiene URLs de un registro interno no accesible desde Vercel:");
  for (const host of detected) console.error(`- ${host}`);
  console.error("Regenera o sanea package-lock.json antes de desplegar.");
  process.exit(1);
}

console.log("OK: package-lock.json usa URLs públicas compatibles con Vercel.");

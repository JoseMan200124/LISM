import type { Metadata } from "next";
import { ApiDocsPage, type DocGroup } from "@/components/api-docs-page";
// Del catálogo, no del registro: importar el registro traería los handlers de
// la aplicación (y con ellos `next/headers`), lo que obligaría a renderizar
// esta página en cada petición en vez de generarla una vez en el build.
import { INTEGRATION_CATALOG } from "@/lib/integration-catalog";

// Documentación técnica pública de la API de integración.
//
// Se sirve sin sesión porque quien conecta el ERP de una institución casi nunca
// tiene usuario en NexaLab: necesita leer esto antes de que le emitan una
// credencial. La página describe la forma de la API —lo mismo que ya publica el
// spec OpenAPI—, nunca datos de ningún laboratorio.

// Sin `dynamic = "force-static"` a propósito: el layout raíz declara
// force-dynamic para poder leer APP_VERSION en cada petición (ver el comentario
// en app/layout.tsx), y esa decisión gana sobre lo que declare una página. Poner
// aquí force-static solo dejaría una afirmación que no se cumple. El contenido
// es constante, así que el coste real es un render por petición de HTML que no
// consulta la base de datos.

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "API de integración | Documentación técnica",
  description:
    "Documentación técnica de la API de NexaLab: conecta inventario, compras, equipos, muestras y cumplimiento con tu ERP, SAP o Power Apps. Autenticación, alcances, operaciones y webhooks.",
  alternates: { canonical: "/docs/api" },
  openGraph: {
    type: "article",
    url: `${siteUrl}/docs/api`,
    title: "API de integración de NexaLab",
    description:
      "Conecta los módulos del laboratorio con tu ERP, SAP o Power Apps. Referencia REST, OAuth2 y webhooks firmados.",
  },
};

/**
 * Agrupa el catálogo por módulo conservando el orden en que se declaró: el
 * registro ya está ordenado por afinidad (inventario junto a datos maestros,
 * compras junto a cumplimiento), y ese orden es el que tiene sentido leer.
 */
function buildGroups(): DocGroup[] {
  const groups = new Map<string, DocGroup>();
  for (const operation of INTEGRATION_CATALOG) {
    const group = groups.get(operation.tag) ?? { tag: operation.tag, operations: [] };
    group.operations.push({
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      summary: operation.summary,
      scope: operation.scope,
    });
    groups.set(operation.tag, group);
  }
  return [...groups.values()];
}

export default function Page() {
  return <ApiDocsPage groups={buildGroups()} baseUrl={siteUrl} />;
}

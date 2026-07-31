import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/integration-openapi";

// El contrato es público: describe la forma de la API, nunca datos. Que se
// pueda leer sin credencial es lo que permite a quien integra preparar el
// trabajo antes de que le emitan la suya, y a Postman o SAP importarlo directo.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrlFrom(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  // Detrás del proxy de Container Apps el esquema real viaja en la cabecera.
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  return NextResponse.json(buildOpenApiDocument(baseUrlFrom(request)), {
    headers: { "cache-control": "public, max-age=300" },
  });
}

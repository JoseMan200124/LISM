import { NextResponse } from "next/server";
import { buildSwagger2Document } from "@/lib/integration-openapi";

// Documento Swagger 2.0 listo para "Crear conector personalizado > Importar
// un archivo OpenAPI" en Power Apps y Power Automate. Se descarga como archivo
// porque ese asistente pide subir el fichero, no una URL.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hostFrom(request: Request): { host: string; scheme: "https" | "http" } {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    return { host: url.host, scheme: url.protocol === "http:" ? "http" : "https" };
  }
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return { host, scheme: proto === "http" ? "http" : "https" };
}

export async function GET(request: Request) {
  const { host, scheme } = hostFrom(request);
  return NextResponse.json(buildSwagger2Document(host, scheme), {
    headers: {
      "cache-control": "public, max-age=300",
      "content-disposition": 'attachment; filename="nexalab-powerapps-connector.json"',
    },
  });
}

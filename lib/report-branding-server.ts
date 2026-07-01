import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReportBranding } from "@/lib/report-template";

let cachedFallbackLogo: string | null = null;

async function resolveFallbackNexaLabLogo(): Promise<string> {
  if (cachedFallbackLogo !== null) return cachedFallbackLogo;
  try {
    const filePath = path.join(process.cwd(), "public", "branding", "nexalab-logo-horizontal.png");
    const buffer = await readFile(filePath);
    cachedFallbackLogo = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    // Si ni siquiera el logo NexaLab se puede leer, el reporte sigue
    // generándose sin imagen — nunca se bloquea la exportación por esto.
    cachedFallbackLogo = "";
  }
  return cachedFallbackLogo;
}

/**
 * Resuelve el branding institucional para un reporte: nombre + logo en
 * base64 (data URI), con fallback automático al logo oficial de NexaLab si
 * no hay logo institucional configurado o si la lectura falla — nunca deja
 * el reporte sin logo ni lo rompe. Solo se usa server-side (lee del
 * filesystem), ver lib/report-template.ts para las funciones seguras para
 * el cliente.
 */
export async function resolveInstitutionBranding(input: {
  organizationName: string | null;
  logoBuffer: { buffer: Buffer; contentType: string } | null;
}): Promise<ReportBranding> {
  if (input.logoBuffer) {
    const dataUri = `data:${input.logoBuffer.contentType};base64,${input.logoBuffer.buffer.toString("base64")}`;
    return { organizationName: input.organizationName, logoDataUri: dataUri };
  }
  return { organizationName: input.organizationName, logoDataUri: await resolveFallbackNexaLabLogo() };
}

import { NextResponse } from "next/server";
import { downloadImage, hasBlobStorage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { resolveInstitutionBranding } from "@/lib/report-branding-server";
import { getSession } from "@/lib/session";

/**
 * Resuelve el branding institucional ya listo para incrustar en un reporte
 * (nombre + logo en base64), server-side, para que la ventana emergente del
 * PDF nunca necesite pedir directamente una URL privada de blob storage.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  let organizationName: string | null = session.laboratoryName ?? null;
  let logoBuffer: { buffer: Buffer; contentType: string } | null = null;

  if (hasDatabase()) {
    const sql = getSql();
    const orgRows = await sql`SELECT name FROM organizations WHERE id = ${session.organizationId} LIMIT 1`;
    const org = orgRows[0] as { name?: string } | undefined;
    if (org?.name) organizationName = org.name;

    if (hasBlobStorage()) {
      const attachmentRows = await sql`
        SELECT storage_key FROM attachments
        WHERE entity_type = 'organization_logo' AND entity_id = ${session.organizationId}
        ORDER BY version_number DESC LIMIT 1
      `;
      const attachment = attachmentRows[0] as { storage_key: string } | undefined;
      if (attachment) {
        logoBuffer = await downloadImage(attachment.storage_key).catch(() => null);
      }
    }
  }

  const branding = await resolveInstitutionBranding({ organizationName, logoBuffer });
  return NextResponse.json({ data: { ...branding, laboratoryName: session.laboratoryName } });
}

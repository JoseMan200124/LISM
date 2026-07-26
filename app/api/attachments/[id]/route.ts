import { NextResponse } from "next/server";
import { hasAnyPermission, type PermissionKey } from "@/lib/authorization";
import { downloadImage, hasBlobStorage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Descarga de un documento adjunto. El permiso se comprueba por el tipo de
// entidad a la que pertenece, no por el archivo: quien puede ver las licencias
// puede abrir el PDF de una licencia, y nadie más.

const VIEW_PERMISSIONS: Record<string, PermissionKey[]> = {
  regulatory_permit: ["compliance.view", "compliance.manage", "inventory.view"],
  inventory_receipt: ["inventory.view", "purchasing.view"],
  reagent_disposal: ["inventory.view", "compliance.view"],
  physical_count: ["inventory.view"],
  reagent_catalog: ["inventory.view"],
  purchase_request: ["purchasing.view"],
  equipment_certificate: ["equipment.view"],
  inventory_safety_sheet: ["inventory.view"],
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase() || !hasBlobStorage()) return NextResponse.json({ message: "Almacenamiento no disponible." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`
    SELECT entity_type, storage_key, original_filename, mime_type
    FROM attachments WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });

  const permissions = VIEW_PERMISSIONS[String(rows[0].entity_type)];
  if (!permissions || !hasAnyPermission(session, permissions)) {
    return NextResponse.json({ message: "Sin permiso para abrir este documento." }, { status: 403 });
  }

  const file = await downloadImage(String(rows[0].storage_key)).catch(() => null);
  if (!file) return NextResponse.json({ message: "Archivo no encontrado en almacenamiento." }, { status: 404 });
  return new Response(new Blob([new Uint8Array(file.buffer)]), {
    headers: {
      "Content-Type": String(rows[0].mime_type ?? file.contentType),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(rows[0].original_filename))}`,
      "Cache-Control": "private, no-store",
    },
  });
}

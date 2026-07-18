import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { deleteImage, downloadImage, hasBlobStorage, uploadImage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Ficha de seguridad o técnica de un artículo como archivo adjunto (PDF o
// imagen). Complementa el campo de URL: la UI permite arrastrar y soltar el
// documento y aquí se guarda versionado en attachments + blob storage.

const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const ENTITY_TYPE = "inventory_safety_sheet";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase() || !hasBlobStorage()) return NextResponse.json({ message: "Almacenamiento no disponible." }, { status: 503 });
  const sql = getSql();
  const rows = await sql`
    SELECT a.storage_key, a.original_filename, a.mime_type
    FROM attachments a
    WHERE a.entity_type = ${ENTITY_TYPE} AND a.entity_id = ${id} AND a.laboratory_id = ${session.laboratoryId}
    ORDER BY a.version_number DESC LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: "Este artículo no tiene ficha adjunta." }, { status: 404 });
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

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase() || !hasBlobStorage()) return NextResponse.json({ message: "El almacenamiento de archivos no está configurado." }, { status: 503 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Adjunta un PDF o imagen de hasta 15 MB." }, { status: 400 });
  }
  const sql = getSql();
  const items = await sql`SELECT id, sku FROM inventory_items WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!items.length) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });

  const previousRows = await sql`
    SELECT storage_key, COALESCE(version_number, 0) AS version_number FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${id} AND laboratory_id = ${session.laboratoryId}
    ORDER BY version_number DESC LIMIT 1
  `;

  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const storageKey = `inventory-safety-sheets/${session.laboratoryId}/${id}/${randomUUID()}.${extension}`;
  await uploadImage(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  try {
    const version = Number(previousRows[0]?.version_number ?? 0) + 1;
    await sql`
      INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, version_number, uploaded_by)
      VALUES (${session.laboratoryId}, ${ENTITY_TYPE}, ${id}, ${storageKey}, ${file.name.slice(0, 260)}, ${file.type}, ${file.size}, ${version}, ${session.userId})
    `;
    await sql`UPDATE inventory_items SET safety_sheet_url = ${`/api/inventory/${id}/safety-sheet`}, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    if (previousRows[0]?.storage_key) await deleteImage(String(previousRows[0].storage_key)).catch(() => {});
    await writeAuditEvent(session, {
      action: "INVENTORY_SAFETY_SHEET_UPLOADED",
      entityType: "inventory_item",
      entityId: id,
      reason: "Ficha de seguridad adjuntada",
      metadata: { filename: file.name, size: file.size, version },
      request,
    });
    return NextResponse.json({ data: { url: `/api/inventory/${id}/safety-sheet`, version } });
  } catch (error) {
    await deleteImage(storageKey).catch(() => {});
    throw error;
  }
}

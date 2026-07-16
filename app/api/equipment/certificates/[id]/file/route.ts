import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { deleteImage, downloadImage, hasBlobStorage, uploadImage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase() || !hasBlobStorage()) return NextResponse.json({ message: "Almacenamiento no disponible." }, { status: 503 }); const sql = getSql();
  const rows = await sql`SELECT a.storage_key, a.original_filename, a.mime_type FROM equipment_certificates c JOIN attachments a ON a.id = c.attachment_id AND a.laboratory_id = c.laboratory_id WHERE c.id = ${id} AND c.laboratory_id = ${session.laboratoryId} AND c.status <> 'ARCHIVED' LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Archivo no encontrado." }, { status: 404 }); const file = await downloadImage(String(rows[0].storage_key));
  if (!file) return NextResponse.json({ message: "Archivo no encontrado en almacenamiento." }, { status: 404 });
  return new Response(new Blob([new Uint8Array(file.buffer)]), { headers: { "Content-Type": String(rows[0].mime_type ?? file.contentType), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(rows[0].original_filename))}`, "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase() || !hasBlobStorage()) return NextResponse.json({ message: "El almacenamiento de archivos no está configurado." }, { status: 503 });
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File) || !allowed.has(file.type) || file.size <= 0 || file.size > 15 * 1024 * 1024) return NextResponse.json({ message: "Adjunta un PDF o imagen de hasta 15 MB." }, { status: 400 });
  const sql = getSql(); const certificates = await sql`SELECT c.id, c.attachment_id, a.storage_key AS previous_key, COALESCE(a.version_number, 0) AS previous_version FROM equipment_certificates c LEFT JOIN attachments a ON a.id = c.attachment_id AND a.laboratory_id = c.laboratory_id WHERE c.id = ${id} AND c.laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!certificates.length) return NextResponse.json({ message: "Certificado no encontrado." }, { status: 404 });
  const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1]; const storageKey = `equipment-certificates/${session.laboratoryId}/${id}/${randomUUID()}.${extension}`; await uploadImage(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  try {
    const attachments = await sql`INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, version_number, uploaded_by) VALUES (${session.laboratoryId}, 'equipment_certificate', ${id}, ${storageKey}, ${file.name.slice(0, 260)}, ${file.type}, ${file.size}, ${Number(certificates[0].previous_version) + 1}, ${session.userId}) RETURNING id, original_filename, version_number`;
    await sql`UPDATE equipment_certificates SET attachment_id = ${attachments[0].id}, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    if (certificates[0].previous_key) await deleteImage(String(certificates[0].previous_key)).catch(() => {});
    await writeAuditEvent(session, { action: "EQUIPMENT_CERTIFICATE_FILE_REPLACED", entityType: "equipment_certificate", entityId: id, metadata: { filename: file.name, size: file.size, version: attachments[0].version_number }, request }); return NextResponse.json({ data: attachments[0] });
  } catch (error) { await deleteImage(storageKey).catch(() => {}); throw error; }
}

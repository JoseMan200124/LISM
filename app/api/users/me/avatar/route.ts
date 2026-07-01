import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { deleteImage, hasBlobStorage, uploadImage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { validateImageFile } from "@/lib/image-upload";
import { getSession } from "@/lib/session";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ENTITY_TYPE = "user_avatar";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasBlobStorage()) return NextResponse.json({ message: "El almacenamiento de imágenes no está configurado en este entorno." }, { status: 503 });
  if (!hasDatabase()) return NextResponse.json({ message: "Esta acción requiere una base de datos configurada." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Adjunta un archivo de imagen." }, { status: 400 });

  const validation = await validateImageFile(file, MAX_AVATAR_BYTES);
  if (!validation.ok) return NextResponse.json({ message: validation.message }, { status: 400 });

  const sql = getSql();
  const previousRows = await sql`
    SELECT id, storage_key FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.userId}
    ORDER BY version_number DESC LIMIT 1
  `;
  const previous = previousRows[0] as { id: string; storage_key: string } | undefined;

  const storageKey = `avatars/${session.userId}/${randomUUID()}.${validation.image.ext}`;
  try {
    await uploadImage(storageKey, validation.image.buffer, validation.image.mimeType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[users/me/avatar] Error subiendo a Blob Storage:", message);
    return NextResponse.json({ message: "No se pudo guardar la imagen. Intenta de nuevo." }, { status: 502 });
  }

  await sql`
    INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
    VALUES (${session.laboratoryId}, ${ENTITY_TYPE}, ${session.userId}, ${storageKey}, ${file.name.slice(0, 250)}, ${validation.image.mimeType}, ${validation.image.buffer.length}, ${session.userId})
  `;

  if (previous) {
    await sql`DELETE FROM attachments WHERE id = ${previous.id}`;
    await deleteImage(previous.storage_key).catch((error) => {
      console.error("[users/me/avatar] No se pudo borrar el avatar anterior del storage:", error instanceof Error ? error.message : error);
    });
  }

  await writeAuditEvent(session, {
    action: "USER_AVATAR_UPDATED",
    entityType: "user",
    entityId: session.userId,
    reason: "Actualización de foto de perfil",
    request,
  });

  return NextResponse.json({ data: { ok: true } });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ message: "Esta acción requiere una base de datos configurada." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`
    SELECT id, storage_key FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.userId}
  `;
  if (rows.length === 0) return NextResponse.json({ data: { ok: true } });

  await sql`DELETE FROM attachments WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.userId}`;

  if (hasBlobStorage()) {
    for (const row of rows as Array<{ storage_key: string }>) {
      await deleteImage(row.storage_key).catch((error) => {
        console.error("[users/me/avatar] No se pudo borrar el avatar del storage:", error instanceof Error ? error.message : error);
      });
    }
  }

  await writeAuditEvent(session, {
    action: "USER_AVATAR_REMOVED",
    entityType: "user",
    entityId: session.userId,
    reason: "Eliminación de foto de perfil",
    request,
  });

  return NextResponse.json({ data: { ok: true } });
}

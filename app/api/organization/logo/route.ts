import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { deleteImage, downloadImage, hasBlobStorage, uploadImage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { validateImageFile } from "@/lib/image-upload";
import { getSession } from "@/lib/session";

const MAX_LOGO_BYTES = 3 * 1024 * 1024; // 3 MB
const ENTITY_TYPE = "organization_logo";

// GET: cualquier miembro autenticado de la organización puede ver el logo
// institucional (no es información sensible, se usa en reportes y en la
// propia pantalla de configuración). POST/DELETE requieren
// configuration.manage (OWNER, LAB_ADMIN, HEAD_OF_LAB).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasBlobStorage() || !hasDatabase()) return NextResponse.json({ message: "No disponible." }, { status: 404 });

  const sql = getSql();
  const rows = await sql`
    SELECT storage_key FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.organizationId}
    ORDER BY version_number DESC LIMIT 1
  `;
  const attachment = rows[0] as { storage_key: string } | undefined;
  if (!attachment) return NextResponse.json({ message: "Sin logo institucional." }, { status: 404 });

  const image = await downloadImage(attachment.storage_key).catch(() => null);
  if (!image) return NextResponse.json({ message: "No disponible." }, { status: 404 });

  return new NextResponse(new Uint8Array(image.buffer), {
    headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=300" },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para gestionar la marca institucional." }, { status: 403 });
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

  const validation = await validateImageFile(file, MAX_LOGO_BYTES);
  if (!validation.ok) return NextResponse.json({ message: validation.message }, { status: 400 });

  const sql = getSql();
  const previousRows = await sql`
    SELECT id, storage_key FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.organizationId}
    ORDER BY version_number DESC LIMIT 1
  `;
  const previous = previousRows[0] as { id: string; storage_key: string } | undefined;

  const storageKey = `organization-logos/${session.organizationId}/${randomUUID()}.${validation.image.ext}`;
  try {
    await uploadImage(storageKey, validation.image.buffer, validation.image.mimeType);
  } catch (error) {
    console.error("[organization/logo] Error subiendo a Blob Storage:", error instanceof Error ? error.message : error);
    return NextResponse.json({ message: "No se pudo guardar la imagen. Intenta de nuevo." }, { status: 502 });
  }

  await sql`
    INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
    VALUES (${session.laboratoryId}, ${ENTITY_TYPE}, ${session.organizationId}, ${storageKey}, ${file.name.slice(0, 250)}, ${validation.image.mimeType}, ${validation.image.buffer.length}, ${session.userId})
  `;

  if (previous) {
    await sql`DELETE FROM attachments WHERE id = ${previous.id}`;
    await deleteImage(previous.storage_key).catch((error) => {
      console.error("[organization/logo] No se pudo borrar el logo anterior del storage:", error instanceof Error ? error.message : error);
    });
  }

  await writeAuditEvent(session, {
    action: "ORGANIZATION_LOGO_UPDATED",
    entityType: "organization",
    entityId: session.organizationId,
    reason: "Actualización de logo institucional",
    request,
  });

  return NextResponse.json({ data: { ok: true } });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para gestionar la marca institucional." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ message: "Esta acción requiere una base de datos configurada." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`
    SELECT id, storage_key FROM attachments
    WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.organizationId}
  `;
  if (rows.length === 0) return NextResponse.json({ data: { ok: true } });

  await sql`DELETE FROM attachments WHERE entity_type = ${ENTITY_TYPE} AND entity_id = ${session.organizationId}`;

  if (hasBlobStorage()) {
    for (const row of rows as Array<{ storage_key: string }>) {
      await deleteImage(row.storage_key).catch((error) => {
        console.error("[organization/logo] No se pudo borrar el logo del storage:", error instanceof Error ? error.message : error);
      });
    }
  }

  await writeAuditEvent(session, {
    action: "ORGANIZATION_LOGO_REMOVED",
    entityType: "organization",
    entityId: session.organizationId,
    reason: "Eliminación de logo institucional",
    request,
  });

  return NextResponse.json({ data: { ok: true } });
}

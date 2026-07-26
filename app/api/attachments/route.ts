import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasAnyPermission, type PermissionKey } from "@/lib/authorization";
import { hasBlobStorage, uploadImage } from "@/lib/blob-storage";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Documentos adjuntos de los módulos de cumplimiento: licencias, permisos,
// certificados, facturas, actas de destrucción y hojas de conteo.
//
// Los archivos nunca se borran: una licencia o una factura que respalda una
// compra de reactivo controlado tiene que seguir ahí cuando llegue la
// inspección. Subir un archivo nuevo sobre la misma entidad crea una versión
// más, no reemplaza la anterior.

const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_BYTES = 25 * 1024 * 1024;

// Qué se puede adjuntar y quién puede hacerlo. Fuera de esta lista no se
// aceptan subidas: evita que la ruta se convierta en un almacén abierto.
const ENTITY_PERMISSIONS: Record<string, PermissionKey[]> = {
  regulatory_permit: ["compliance.manage", "configuration.manage"],
  inventory_receipt: ["inventory.manage", "purchasing.manage"],
  reagent_disposal: ["inventory.manage", "compliance.manage"],
  physical_count: ["inventory.manage", "compliance.manage"],
  reagent_catalog: ["inventory.manage"],
  purchase_request: ["purchasing.manage"],
  equipment_certificate: ["equipment.manage"],
};

const VIEW_PERMISSIONS: Record<string, PermissionKey[]> = {
  regulatory_permit: ["compliance.view", "compliance.manage", "inventory.view"],
  inventory_receipt: ["inventory.view", "purchasing.view"],
  reagent_disposal: ["inventory.view", "compliance.view"],
  physical_count: ["inventory.view"],
  reagent_catalog: ["inventory.view"],
  purchase_request: ["purchasing.view"],
  equipment_certificate: ["equipment.view"],
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") ?? "";
  const entityId = url.searchParams.get("entityId") ?? "";
  const permissions = VIEW_PERMISSIONS[entityType];
  if (!permissions) return NextResponse.json({ message: "Tipo de documento no soportado." }, { status: 400 });
  if (!databaseIdSchema.safeParse(entityId).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasAnyPermission(session, permissions)) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.original_filename, a.mime_type, a.size_bytes, a.version_number, a.uploaded_at,
           u.full_name AS uploaded_by_name
    FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
    WHERE a.laboratory_id = ${session.laboratoryId} AND a.entity_type = ${entityType} AND a.entity_id = ${entityId}
    ORDER BY a.version_number DESC
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Un invitado no puede adjuntar documentos." }, { status: 403 });
  if (!hasBlobStorage() || !hasDatabase()) {
    return NextResponse.json({ message: "El almacenamiento de archivos no está configurado." }, { status: 503 });
  }

  const form = await request.formData();
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const label = String(form.get("label") ?? "").slice(0, 200);
  const file = form.get("file");

  const permissions = ENTITY_PERMISSIONS[entityType];
  if (!permissions) return NextResponse.json({ message: "Tipo de documento no soportado." }, { status: 400 });
  if (!databaseIdSchema.safeParse(entityId).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasAnyPermission(session, permissions)) return NextResponse.json({ message: "No tienes permiso para adjuntar este documento." }, { status: 403 });
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Adjunta un PDF, imagen o documento de Office de hasta 25 MB." }, { status: 400 });
  }

  const sql = getSql();
  const previous = await sql`
    SELECT COALESCE(max(version_number), 0) AS version FROM attachments
    WHERE laboratory_id = ${session.laboratoryId} AND entity_type = ${entityType} AND entity_id = ${entityId}
  `;
  const version = Number(previous[0]?.version ?? 0) + 1;
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
  const storageKey = `compliance/${session.laboratoryId}/${entityType}/${entityId}/v${version}-${randomUUID()}.${extension}`;

  await uploadImage(storageKey, Buffer.from(await file.arrayBuffer()), file.type);
  const rows = await sql`
    INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, version_number, uploaded_by)
    VALUES (${session.laboratoryId}, ${entityType}, ${entityId}, ${storageKey}, ${(label || file.name).slice(0, 250)}, ${file.type}, ${file.size}, ${version}, ${session.userId})
    RETURNING id, original_filename, mime_type, size_bytes, version_number, uploaded_at
  `;

  await writeAuditEvent(session, {
    action: "COMPLIANCE_DOCUMENT_UPLOADED",
    entityType,
    entityId,
    newValue: { attachmentId: rows[0].id, filename: file.name, size: file.size, version },
    reason: label || `Documento adjuntado (versión ${version})`,
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

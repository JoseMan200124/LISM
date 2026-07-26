import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { DOCUMENT_CATEGORIES } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";
import { deleteImage, downloadImage, hasBlobStorage, uploadImage } from "@/lib/blob-storage";

// Detalle, versiones y archivo de un documento del repositorio.
//
// GET             ficha con todas sus versiones
// GET ?download=1 descarga la versión vigente (o ?version=N)
// PATCH           edita metadatos o archiva
// PUT             sube una versión nueva (multipart)

const ALLOWED_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);
const MAX_BYTES = 25 * 1024 * 1024;

const patchSchema = z.object({
  title: z.string().min(3).max(240).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  description: z.string().max(4000).optional().nullable(),
  projectId: databaseIdSchema.optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const documents = await sql`
    SELECT d.*, p.code AS project_code, p.title AS project_title, u.full_name AS created_by_name
    FROM research_documents d
    LEFT JOIN research_projects p ON p.id = d.project_id
    LEFT JOIN users u ON u.id = d.created_by
    WHERE d.id = ${id} AND d.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!documents.length) return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });

  const versions = await sql`
    SELECT v.*, u.full_name AS uploaded_by_name
    FROM research_document_versions v LEFT JOIN users u ON u.id = v.uploaded_by
    WHERE v.document_id = ${id} AND v.laboratory_id = ${session.laboratoryId}
    ORDER BY v.version_number DESC
  `;

  const url = new URL(request.url);
  if (url.searchParams.get("download") === "1") {
    const requested = url.searchParams.get("version");
    const version = requested
      ? (versions as Array<Record<string, unknown>>).find((entry) => String(entry.version_number) === requested)
      : (versions as Array<Record<string, unknown>>)[0];
    if (!version) return NextResponse.json({ message: "Esa versión no existe." }, { status: 404 });
    if (version.external_url) return NextResponse.redirect(String(version.external_url));
    if (!version.storage_key || !hasBlobStorage()) return NextResponse.json({ message: "Este documento no tiene archivo almacenado." }, { status: 404 });
    const file = await downloadImage(String(version.storage_key)).catch(() => null);
    if (!file) return NextResponse.json({ message: "Archivo no encontrado en almacenamiento." }, { status: 404 });
    return new Response(new Blob([new Uint8Array(file.buffer)]), {
      headers: {
        "Content-Type": String(version.mime_type ?? file.contentType),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(version.original_filename ?? "documento"))}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({ data: { ...documents[0], versions } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch("documents.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const existing = await sql`SELECT * FROM research_documents WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });

  const rows = await sql`
    UPDATE research_documents SET
      title = COALESCE(${payload.title ?? null}, title),
      category = COALESCE(${payload.category ?? null}, category),
      description = ${payload.description === undefined ? existing[0].description : payload.description},
      project_id = ${payload.projectId === undefined ? existing[0].project_id : payload.projectId},
      expires_on = ${payload.expiresOn === undefined ? existing[0].expires_on : payload.expiresOn},
      tags = COALESCE(${payload.tags ? JSON.stringify(payload.tags) : null}::jsonb, tags),
      status = COALESCE(${payload.status ?? null}, status),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *
  `;
  await writeAuditEvent(session, {
    action: payload.status === "ARCHIVED" ? "RESEARCH_DOCUMENT_ARCHIVED" : "RESEARCH_DOCUMENT_UPDATED",
    entityType: "research_document", entityId: id,
    previousValue: existing[0], newValue: rows[0], reason: "Actualización del documento", request,
  });
  return NextResponse.json({ data: rows[0] });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch("documents.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasBlobStorage()) return NextResponse.json({ message: "El almacenamiento de archivos no está configurado." }, { status: 503 });

  const documents = await sql`SELECT id, code, current_version FROM research_documents WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!documents.length) return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const changeSummary = String(form.get("changeSummary") ?? "").slice(0, 2000) || null;
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Adjunta un PDF, imagen, documento de Office o texto de hasta 25 MB." }, { status: 400 });
  }

  const version = Number(documents[0].current_version ?? 0) + 1;
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
  const storageKey = `research-documents/${session.laboratoryId}/${id}/v${version}-${randomUUID()}.${extension}`;
  await uploadImage(storageKey, Buffer.from(await file.arrayBuffer()), file.type);

  try {
    await sql`
      INSERT INTO research_document_versions (
        document_id, laboratory_id, version_number, change_summary, storage_key,
        original_filename, mime_type, size_bytes, uploaded_by
      ) VALUES (
        ${id}, ${session.laboratoryId}, ${version}, ${changeSummary}, ${storageKey},
        ${file.name.slice(0, 250)}, ${file.type}, ${file.size}, ${session.userId}
      )
    `;
    await sql`UPDATE research_documents SET current_version = ${version}, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    await writeAuditEvent(session, {
      action: "RESEARCH_DOCUMENT_VERSION_UPLOADED", entityType: "research_document", entityId: id,
      newValue: { version, filename: file.name, size: file.size },
      reason: changeSummary || `Versión ${version} cargada`, request,
    });
    return NextResponse.json({ data: { version } }, { status: 201 });
  } catch (error) {
    // Si la fila no llegó a guardarse, el archivo no debe quedar huérfano.
    await deleteImage(storageKey).catch(() => {});
    throw error;
  }
}

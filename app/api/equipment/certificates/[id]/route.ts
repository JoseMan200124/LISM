import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

const schema = z.object({ certificateNumber: z.string().min(2).max(120).optional(), providerName: z.string().min(2).max(180).optional(), issuedAt: z.string().date().optional(), expiresAt: z.string().date().nullable().optional(), uncertaintyText: z.string().max(1000).nullable().optional(), scopeText: z.string().max(2000).nullable().optional(), action: z.enum(["UPDATE", "ARCHIVE"]).default("UPDATE") });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" }); const sql = getSql();
  const rows = await sql`SELECT c.*, e.code AS equipment_code, e.name AS equipment_name, a.original_filename, a.mime_type, a.size_bytes, a.version_number FROM equipment_certificates c JOIN equipment e ON e.id = c.equipment_id AND e.laboratory_id = c.laboratory_id LEFT JOIN attachments a ON a.id = c.attachment_id AND a.laboratory_id = c.laboratory_id WHERE c.id = ${id} AND c.laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Certificado no encontrado." }, { status: 404 }); return NextResponse.json({ data: rows[0] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: "Certificado inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" }); const sql = getSql();
  const previous = await sql`SELECT * FROM equipment_certificates WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`; if (!previous.length) return NextResponse.json({ message: "Certificado no encontrado." }, { status: 404 });
  const p = parsed.data; const rows = await sql`UPDATE equipment_certificates SET certificate_number = COALESCE(${p.certificateNumber ?? null}, certificate_number), provider_name = COALESCE(${p.providerName ?? null}, provider_name), issued_at = COALESCE(${p.issuedAt ?? null}, issued_at), expires_at = CASE WHEN ${p.expiresAt === undefined} THEN expires_at ELSE ${p.expiresAt ?? null} END, uncertainty_text = CASE WHEN ${p.uncertaintyText === undefined} THEN uncertainty_text ELSE ${p.uncertaintyText ?? null} END, scope_text = CASE WHEN ${p.scopeText === undefined} THEN scope_text ELSE ${p.scopeText ?? null} END, status = CASE WHEN ${p.action === "ARCHIVE"} THEN 'ARCHIVED' ELSE status END, archived_at = CASE WHEN ${p.action === "ARCHIVE"} THEN now() ELSE archived_at END, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: `EQUIPMENT_CERTIFICATE_${p.action}`, entityType: "equipment_certificate", entityId: id, previousValue: previous[0], newValue: rows[0], request }); return NextResponse.json({ data: rows[0] });
}

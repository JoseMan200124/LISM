import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { createAccessCode, findDemoQrLabelById, hashAccessCode, issueDemoAccessCode } from "@/lib/qr-security";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";

function canIssue(session: Awaited<ReturnType<typeof getSession>>, entityType: string) {
  if (!session) return false;
  return entityType === "INVENTORY_ITEM" ? hasPermission(session, "inventory.manage") || hasPermission(session, "inventory.move") : hasPermission(session, "equipment.manage");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const { id } = await params;
  if (!hasDatabase()) {
    const label = findDemoQrLabelById(id);
    if (!label) return NextResponse.json({ message: "Etiqueta no encontrada." }, { status: 404 });
    if (!canIssue(session, label.entityType)) return NextResponse.json({ message: "No tienes permiso para generar códigos temporales." }, { status: 403 });
    return NextResponse.json({ data: issueDemoAccessCode(label.id), mode: "demo" }, { status: 201 });
  }

  const sql = getSql();
  const labels = await sql`SELECT id, entity_type, label_code FROM qr_identifiers WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
  const label = labels[0] as Record<string, unknown> | undefined;
  if (!label) return NextResponse.json({ message: "Etiqueta no encontrada." }, { status: 404 });
  if (!canIssue(session, String(label.entity_type))) return NextResponse.json({ message: "No tienes permiso para generar códigos temporales." }, { status: 403 });

  const code = createAccessCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await sql`UPDATE qr_access_codes SET consumed_at = now() WHERE qr_identifier_id = ${id} AND consumed_at IS NULL`;
  const rows = await sql`
    INSERT INTO qr_access_codes (laboratory_id, qr_identifier_id, code_hash, expires_at, created_by)
    VALUES (${session.laboratoryId}, ${id}, ${hashAccessCode(id, code)}, ${expiresAt}, ${session.userId})
    RETURNING id, expires_at
  `;
  await writeAuditEvent(session, { action: "QR_ONE_TIME_CODE_ISSUED", entityType: "qr_identifier", entityId: id, newValue: { codeId: rows[0].id, expiresAt: rows[0].expires_at }, reason: "Código temporal de consulta QR", request });
  return NextResponse.json({ data: { code, expiresAt: String(rows[0].expires_at), ttlMinutes: 10 }, mode: "database" }, { status: 201 });
}

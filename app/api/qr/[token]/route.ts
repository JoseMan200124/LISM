import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { hasPermission, type PermissionKey } from "@/lib/authorization";
import { findDemoQrLabelByToken } from "@/lib/qr-security";
import { getSession } from "@/lib/session";

const permissionsByEntity: Record<string, PermissionKey> = {
  INVENTORY_ITEM: "inventory.view",
  EQUIPMENT: "equipment.view",
  SPECIMEN: "specimens.view",
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "Inicia sesión para consultar esta etiqueta." }, { status: 401 });
  const { token } = await params;
  if (!hasDatabase()) {
    const label = findDemoQrLabelByToken(token);
    if (!label) return NextResponse.json({ message: "Etiqueta no encontrada o sin acceso." }, { status: 404 });
    const requiredPermission = permissionsByEntity[label.entityType];
    if (!requiredPermission || !hasPermission(session, requiredPermission)) return NextResponse.json({ message: "No tienes acceso a esta etiqueta." }, { status: 403 });
    return NextResponse.json({ mode: "demo", data: { token, labelCode: label.labelCode, entityType: label.entityType, name: label.displayName, location: label.location, actions: label.profile.allowedActions } });
  }
  const sql = getSql();
  const identifiers = await sql`SELECT * FROM qr_identifiers WHERE opaque_token = ${token} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
  const qr = identifiers[0] as Record<string, unknown> | undefined;
  if (!qr) return NextResponse.json({ message: "Etiqueta no encontrada o sin acceso." }, { status: 404 });
  const requiredPermission = permissionsByEntity[String(qr.entity_type)];
  if (!requiredPermission || !hasPermission(session, requiredPermission)) return NextResponse.json({ message: "No tienes acceso a esta etiqueta." }, { status: 403 });
  return NextResponse.json({ data: qr, mode: "database" });
}

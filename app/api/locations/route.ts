import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  code: z.string().min(2).max(60),
  name: z.string().min(2).max(160),
  locationType: z.string().min(2).max(60).default("STORAGE"),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view") && !hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar ubicaciones." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT id, code, name, location_type, status
    FROM storage_locations
    WHERE laboratory_id = ${session.laboratoryId}
    ORDER BY name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage") && !hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para crear ubicaciones." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Ubicación inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, status: "ACTIVE" }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const rows = await sql`
    INSERT INTO storage_locations (laboratory_id, code, name, location_type)
    VALUES (${session.laboratoryId}, ${payload.code}, ${payload.name}, ${payload.locationType})
    ON CONFLICT (laboratory_id, code)
    DO UPDATE SET name = EXCLUDED.name, location_type = EXCLUDED.location_type, status = 'ACTIVE'
    RETURNING id, code, name, location_type, status
  `;
  await writeAuditEvent(session, { action: "STORAGE_LOCATION_CREATED", entityType: "storage_location", entityId: String(rows[0].id), newValue: rows[0], reason: "Alta o reactivación de ubicación", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

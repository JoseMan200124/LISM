import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { THEME_PREFERENCES } from "@/lib/theme";

const patchSchema = z.object({
  theme: z.enum(THEME_PREFERENCES),
  compactTables: z.boolean().optional(),
  showTopbarAlerts: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ data: { theme: "system", compactTables: false, showTopbarAlerts: true }, mode: "demo" });
  const sql = getSql();
  const rows = await sql`SELECT preferences FROM users WHERE id = ${session.userId} LIMIT 1`;
  if (rows.length === 0) return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
  return NextResponse.json({ data: rows[0].preferences ?? { theme: "system" }, mode: "database" });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Preferencias inválidas.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: parsed.data, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT preferences FROM users WHERE id = ${session.userId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Usuario no encontrado." }, { status: 404 });
  const rows = await sql`
    UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || ${JSON.stringify(parsed.data)}::jsonb
    WHERE id = ${session.userId}
    RETURNING preferences
  `;
  await writeAuditEvent(session, { action: "USER_PREFERENCES_UPDATED", entityType: "user_preferences", entityId: session.userId, previousValue: previous[0].preferences, newValue: rows[0].preferences, reason: "Actualización de preferencias personales", request });
  return NextResponse.json({ data: rows[0].preferences, mode: "database" });
}

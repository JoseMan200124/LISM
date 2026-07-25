import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import {
  DEFAULT_CONTROLLED_POLICY,
  MAX_VALIDITY_HOURS,
  MIN_VALIDITY_HOURS,
  clampValidityHours,
  resolveControlledPolicy,
} from "@/lib/controlled-reagents";
import { isMissingAuthorizationMigration, loadControlledPolicy } from "@/lib/controlled-usage-service";

// Política del laboratorio para el uso de reactivos controlados: si el consumo
// exige autorización previa del responsable y cuánto tiempo permanece vigente
// una autorización aprobada. Se guarda en
// laboratory_settings.controlled_usage_policy (migración 0020).

const putSchema = z.object({
  requirePreapproval: z.boolean(),
  validityHours: z.coerce.number().min(MIN_VALIDITY_HOURS).max(MAX_VALIDITY_HOURS),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar esta configuración." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: DEFAULT_CONTROLLED_POLICY, mode: "demo" });
  const policy = await loadControlledPolicy(session.laboratoryId);
  return NextResponse.json({ data: policy, mode: "database" });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "Solo un administrador puede cambiar la política de reactivos controlados." }, { status: 403 });
  }
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Configuración inválida.", issues: parsed.error.issues }, { status: 400 });
  const next = { requirePreapproval: parsed.data.requirePreapproval, validityHours: clampValidityHours(parsed.data.validityHours) };
  if (!hasDatabase()) return NextResponse.json({ data: next, mode: "demo" });

  const sql = getSql();
  try {
    const previous = await loadControlledPolicy(session.laboratoryId);
    const rows = await sql`
      INSERT INTO laboratory_settings (laboratory_id, controlled_usage_policy)
      VALUES (${session.laboratoryId}, ${JSON.stringify(next)}::jsonb)
      ON CONFLICT (laboratory_id)
      DO UPDATE SET controlled_usage_policy = EXCLUDED.controlled_usage_policy, updated_at = now()
      RETURNING controlled_usage_policy
    `;
    await writeAuditEvent(session, {
      action: "CONTROLLED_USAGE_POLICY_UPDATED",
      entityType: "laboratory_settings",
      entityId: session.laboratoryId,
      previousValue: previous,
      newValue: rows[0].controlled_usage_policy,
      reason: next.requirePreapproval
        ? "El consumo de reactivos controlados exige autorización previa"
        : "El consumo de reactivos controlados no exige autorización previa",
      request,
    });
    return NextResponse.json({ data: resolveControlledPolicy(rows[0].controlled_usage_policy) });
  } catch (error) {
    if (isMissingAuthorizationMigration(error)) {
      return NextResponse.json({ message: "Esta configuración estará disponible al aplicar la actualización de base de datos (migración 0020)." }, { status: 503 });
    }
    throw error;
  }
}

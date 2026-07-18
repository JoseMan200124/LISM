import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Gestión de un usuario del laboratorio por el administrador: cambiar rol,
// bloquear/reactivar el acceso y restablecer la contraseña (temporal, se
// muestra una sola vez). Todo queda en la bitácora.

const ASSIGNABLE_ROLES = ["LAB_ADMIN", "HEAD_OF_LAB", "ANALYST", "ASSISTANT", "AUDITOR", "CONSULTATION", "PROFESSOR", "STUDENT"] as const;

const patchSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  resetPassword: z.boolean().optional(),
}).refine((value) => value.role || value.status || value.resetPassword, { message: "No hay cambios que aplicar." });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para gestionar usuarios." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Esta acción requiere una base de datos configurada." }, { status: 503 });
  if (id === session.userId && (parsed.data.role || parsed.data.status)) {
    return NextResponse.json({ message: "No puedes cambiar tu propio rol ni bloquearte a ti mismo." }, { status: 400 });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, m.role, m.status AS membership_status
    FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.laboratory_id = ${session.laboratoryId}
    WHERE u.id = ${id}
    LIMIT 1
  `;
  const user = rows[0] as Record<string, unknown> | undefined;
  if (!user) return NextResponse.json({ message: "Usuario no encontrado en este laboratorio." }, { status: 404 });
  if (String(user.role) === "OWNER") return NextResponse.json({ message: "El propietario de la cuenta no puede modificarse desde aquí." }, { status: 400 });

  let temporaryPassword: string | null = null;

  if (parsed.data.role) {
    await sql`UPDATE memberships SET role = ${parsed.data.role}, updated_at = now() WHERE user_id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    await writeAuditEvent(session, {
      action: "USER_ROLE_UPDATED",
      entityType: "user",
      entityId: id,
      previousValue: { role: user.role },
      newValue: { role: parsed.data.role },
      reason: "Cambio de rol por el administrador",
      request,
    });
  }

  if (parsed.data.status) {
    await sql`UPDATE memberships SET status = ${parsed.data.status}, updated_at = now() WHERE user_id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    await writeAuditEvent(session, {
      action: "USER_STATUS_UPDATED",
      entityType: "user",
      entityId: id,
      previousValue: { status: user.membership_status },
      newValue: { status: parsed.data.status },
      reason: parsed.data.status === "ACTIVE" ? "Acceso reactivado" : "Acceso bloqueado",
      request,
    });
  }

  if (parsed.data.resetPassword) {
    temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await hash(temporaryPassword, 10);
    await sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${id}`;
    await writeAuditEvent(session, {
      action: "USER_PASSWORD_RESET",
      entityType: "user",
      entityId: id,
      reason: "Contraseña restablecida por el administrador",
      request,
    });
  }

  return NextResponse.json({ data: { id, role: parsed.data.role ?? user.role, status: parsed.data.status ?? user.membership_status, temporaryPassword } });
}

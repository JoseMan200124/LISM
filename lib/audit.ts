import { getSql, hasDatabase } from "@/lib/db";
import type { UserSession } from "@/lib/session";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

export async function writeAuditEvent(session: UserSession, input: AuditInput): Promise<void> {
  if (!hasDatabase() || session.sessionMode === "demo") return;
  const sql = getSql();
  const forwardedFor = input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = input.request?.headers.get("user-agent") || null;
  await sql`
    INSERT INTO audit_logs (
      organization_id, laboratory_id, actor_user_id, action, entity_type, entity_id,
      previous_value, new_value, reason, metadata, ip_address, user_agent
    ) VALUES (
      ${session.organizationId}, ${session.laboratoryId}, ${session.userId}, ${input.action}, ${input.entityType}, ${input.entityId ?? null},
      ${input.previousValue === undefined ? null : JSON.stringify(input.previousValue)}::jsonb,
      ${input.newValue === undefined ? null : JSON.stringify(input.newValue)}::jsonb,
      ${input.reason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${forwardedFor}, ${userAgent}
    )
  `;
}

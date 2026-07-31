import { getSql, hasDatabase } from "@/lib/db";
import type { UserSession } from "@/lib/session";
import { emitWebhookEvent } from "@/lib/integration-webhooks";

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
  // Un invitado no es un usuario registrado: el actor queda vacío y su
  // identidad declarada (nombre, código con el que entró) se conserva en los
  // metadatos, de modo que la acción nunca queda huérfana en la bitácora.
  const guest = session.guest;
  const actorUserId = guest ? null : session.userId;
  const metadata = guest
    ? { ...(input.metadata ?? {}), guest: { name: session.name, grantId: guest.grantId, sessionId: guest.sessionId, grantLabel: guest.grantLabel } }
    : (input.metadata ?? {});
  await sql`
    INSERT INTO audit_logs (
      organization_id, laboratory_id, actor_user_id, action, entity_type, entity_id,
      previous_value, new_value, reason, metadata, ip_address, user_agent
    ) VALUES (
      ${session.organizationId}, ${session.laboratoryId}, ${actorUserId}, ${input.action}, ${input.entityType}, ${input.entityId ?? null},
      ${input.previousValue === undefined ? null : JSON.stringify(input.previousValue)}::jsonb,
      ${input.newValue === undefined ? null : JSON.stringify(input.newValue)}::jsonb,
      ${input.reason ?? null}, ${JSON.stringify(metadata)}::jsonb,
      ${forwardedFor}, ${userAgent}
    )
  `;

  // Aviso a los sistemas externos suscritos. Va después de que la bitácora
  // quede escrita —nunca se anuncia algo que no ocurrió— y sin await: el
  // laboratorio no espera a que responda el ERP de nadie, y un webhook mal
  // configurado no puede tumbar la operación que lo originó.
  void emitWebhookEvent({
    organizationId: session.organizationId,
    laboratoryId: session.laboratoryId,
    eventType: input.action,
    payload: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason ?? null,
      metadata,
      laboratoryId: session.laboratoryId,
      organizationId: session.organizationId,
      actor: guest ? { kind: "guest", name: session.name } : { kind: "user", id: session.userId, name: session.name },
      occurredAt: new Date().toISOString(),
    },
  }).catch(() => {});
}

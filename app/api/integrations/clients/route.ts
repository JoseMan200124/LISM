import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { writeAuditEvent } from "@/lib/audit";
import { generateApiCredentials } from "@/lib/integration-auth";
import { INTEGRATION_SCOPES, normalizeScopes } from "@/lib/integration-scopes";

// Administración de las credenciales de integración desde la aplicación.
// Exige configuration.manage: emitir una llave que abre el laboratorio a un
// sistema externo es una decisión de administrador, no de operación diaria.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(3).max(160),
  description: z.string().max(500).optional().default(""),
  systemKind: z
    .enum(["GENERIC", "SAP", "POWER_APPS", "ERP", "IPAAS", "CUSTOM", "AI_ASSISTANT"])
    .optional()
    .default("GENERIC"),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(6000).optional().default(120),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.name, c.description, c.system_kind, c.client_id, c.key_prefix, c.scopes,
           c.rate_limit_per_minute, c.status, c.expires_at, c.last_used_at, c.created_at,
           u.full_name AS actor_name,
           (SELECT count(*) FROM api_request_logs l WHERE l.api_client_id = c.id) AS request_count
    FROM api_clients c
    LEFT JOIN users u ON u.id = c.actor_user_id
    WHERE c.laboratory_id = ${session.laboratoryId}
    ORDER BY c.created_at DESC
  `;

  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para emitir credenciales de integración." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos de la credencial inválidos.", issues: parsed.error.issues }, { status: 400 });
  }
  const payload = parsed.data;
  const scopes = normalizeScopes(payload.scopes);
  if (scopes.length === 0) {
    return NextResponse.json({ message: "Debes conceder al menos un alcance válido." }, { status: 400 });
  }

  const credentials = generateApiCredentials();
  const sql = getSql();

  // El responsable es quien la emite: sus permisos son el techo de lo que la
  // integración podrá hacer, así que queda explícito quién responde por ella.
  const rows = await sql`
    INSERT INTO api_clients (
      organization_id, laboratory_id, name, description, system_kind,
      client_id, key_prefix, key_hash, scopes, actor_user_id,
      rate_limit_per_minute, expires_at, created_by
    ) VALUES (
      ${session.organizationId}, ${session.laboratoryId}, ${payload.name}, ${payload.description || null}, ${payload.systemKind},
      ${credentials.clientId}, ${credentials.keyPrefix}, ${credentials.keyHash}, ${JSON.stringify(scopes)}::jsonb, ${session.userId},
      ${payload.rateLimitPerMinute}, ${payload.expiresAt ?? null}, ${session.userId}
    )
    RETURNING id, name, client_id, key_prefix, scopes, rate_limit_per_minute, status, created_at
  `;

  await writeAuditEvent(session, {
    action: "INTEGRATION_CLIENT_CREATED",
    entityType: "api_client",
    entityId: String(rows[0].id),
    // El secreto NO entra en la bitácora, solo el prefijo que identifica cuál es.
    newValue: { name: payload.name, systemKind: payload.systemKind, scopes, keyPrefix: credentials.keyPrefix },
    reason: "Alta de credencial de integración con sistema externo",
    metadata: { clientId: credentials.clientId },
    request,
  });

  return NextResponse.json(
    {
      data: {
        ...rows[0],
        // Única vez que el secreto existe fuera del generador. No se guarda en
        // claro en ningún sitio: si se pierde, se rota la credencial.
        secret: credentials.secret,
        secretShownOnce: true,
      },
    },
    { status: 201 },
  );
}

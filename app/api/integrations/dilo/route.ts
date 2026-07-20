import { NextResponse } from "next/server";
import { hasPermission, type PermissionKey } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import type { UserSession } from "@/lib/session";
import {
  DILO_MUTATION_ACTIONS,
  DILO_READ_ACTIONS,
  runDiloNativeRead,
  runDiloNativeMutation,
  type DiloReadAction,
  type DiloMutationAction,
} from "@/lib/dilo-native-actions";
import {
  DILO_SIGNATURE_HEADER,
  DILO_TIMESTAMP_HEADER,
  buildBridgeSession,
  hashLinkCode,
  isDiloBridgeConfigured,
  listUserLaboratories,
  normalizePhone,
  resolveLaboratory,
  resolveLinkedUser,
  verifyDiloSignature,
  type DiloLinkedUser,
} from "@/lib/dilo-bridge";

// Endpoint único servicio-a-servicio para el asistente Dilo (WhatsApp).
// Todo el cuerpo llega FIRMADO con HMAC (ver lib/dilo-bridge.ts). Cada acción de
// datos exige además que el teléfono tenga un dilo_links LINKED; un número no
// vinculado nunca obtiene datos: recibe { linked: false } para que Dilo le
// explique cómo vincularse. v1 es SOLO LECTURA a propósito: en un LIMS los
// cambios exigen trazabilidad completa (audit trail, firmas) y se hacen en la web.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

function ok(data: Record<string, unknown>) {
  return NextResponse.json({ success: true, data });
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Resuelve el laboratorio pedido (por nombre) a la sesión sintetizada del puente,
 * o devuelve una respuesta lista para Dilo cuando falta/es ambiguo, verificando
 * de una vez el permiso requerido para la acción.
 */
async function sessionForLabQuery(
  user: DiloLinkedUser,
  labQuery: string | null,
  permission: PermissionKey,
): Promise<{ session: UserSession } | { response: ReturnType<typeof ok> }> {
  const laboratories = await listUserLaboratories(user.userId);
  const resolved = resolveLaboratory(laboratories, labQuery);
  if (resolved.status === "ambiguous") {
    return {
      response: ok({
        linked: true,
        error: "laboratory_ambiguous",
        message: "Hay varios laboratorios que coinciden. Pide al usuario que precise cuál.",
        candidates: resolved.matches.map((l) => l.laboratoryName),
      }),
    };
  }
  if (resolved.status === "none") {
    return {
      response: ok({
        linked: true,
        error: "laboratory_not_found",
        message: labQuery
          ? "No encontré ese laboratorio entre los del usuario."
          : laboratories.length === 0
            ? "El usuario ya no pertenece a ningún laboratorio activo."
            : "El usuario pertenece a varios laboratorios; hay que indicar cuál.",
        laboratories: resolved.laboratories.map((l) => l.laboratoryName),
      }),
    };
  }
  const session = buildBridgeSession(user, resolved.laboratory);
  if (!hasPermission(session, permission)) {
    return {
      response: ok({
        linked: true,
        error: "no_permission",
        message: "El usuario no tiene permiso para ver esa información en ese laboratorio.",
      }),
    };
  }
  return { session };
}

async function sessionForLabMembership(
  user: DiloLinkedUser,
  labQuery: string | null,
): Promise<{ session: UserSession } | { response: ReturnType<typeof ok> }> {
  const laboratories = await listUserLaboratories(user.userId);
  const resolved = resolveLaboratory(laboratories, labQuery);
  if (resolved.status === "ambiguous") {
    return { response: ok({ linked: true, error: "laboratory_ambiguous", message: "Hay varios laboratorios que coinciden. Pide al usuario que precise cuál.", candidates: resolved.matches.map((l) => l.laboratoryName) }) };
  }
  if (resolved.status === "none") {
    return { response: ok({
      linked: true,
      error: "laboratory_not_found",
      message: labQuery ? "No encontré ese laboratorio entre los del usuario." : laboratories.length === 0 ? "El usuario ya no pertenece a ningún laboratorio activo." : "El usuario pertenece a varios laboratorios; hay que indicar cuál.",
      laboratories: resolved.laboratories.map((l) => l.laboratoryName),
    }) };
  }
  return { session: buildBridgeSession(user, resolved.laboratory) };
}

async function handleLinkRedeem(body: Body) {
  const phone = normalizePhone(str(body.phone));
  const code = str(body.code);
  if (!phone || !code) return ok({ linked: false, error: "bad_request", message: "Falta teléfono o código." });
  const sql = getSql();

  const links = await sql`
    SELECT dl.user_id, dl.link_code_expires_at, u.full_name
    FROM dilo_links dl
    JOIN users u ON u.id = dl.user_id AND u.status = 'ACTIVE'
    WHERE dl.link_code_hash = ${hashLinkCode(code)} AND dl.status IN ('PENDING', 'LINKED', 'REVOKED')
    LIMIT 1
  `;
  const link = links[0] as { user_id: string; link_code_expires_at: string | Date | null; full_name: string } | undefined;
  const expiresAt = link?.link_code_expires_at ? new Date(link.link_code_expires_at).getTime() : 0;
  if (!link || expiresAt < Date.now()) {
    return ok({ linked: false, error: "invalid_code", message: "El código no es válido o ya expiró. Genera uno nuevo en NexaLab (botón de Dilo, abajo a la derecha)." });
  }

  // Si el teléfono ya pertenece a OTRO usuario, no lo robamos: pedimos desvincular primero.
  const taken = await sql`SELECT 1 FROM dilo_links WHERE phone_digits = ${phone} AND user_id <> ${link.user_id} LIMIT 1`;
  if (taken.length > 0) {
    return ok({ linked: false, error: "phone_taken", message: "Este número ya está vinculado a otra cuenta de NexaLab. Desvincúlalo primero desde esa cuenta." });
  }

  await sql`
    UPDATE dilo_links
    SET phone_digits = ${phone}, status = 'LINKED', linked_at = now(), last_used_at = now(),
        link_code_hash = NULL, link_code_expires_at = NULL, updated_at = now()
    WHERE user_id = ${link.user_id}
  `;
  return ok({ linked: true, action: "linked", userName: link.full_name });
}

async function handleContext(user: DiloLinkedUser) {
  const laboratories = await listUserLaboratories(user.userId);
  return ok({
    linked: true,
    user: { name: user.name, email: user.email },
    laboratories: laboratories.map((l) => ({ name: l.laboratoryName, role: l.role, permissions: l.permissions })),
  });
}

async function handleInventoryList(user: DiloLinkedUser, body: Body) {
  const resolved = await sessionForLabQuery(user, str(body.laboratory), "inventory.view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;
  const sql = getSql();

  const filter = str(body.filter) ?? "all"; // all | low_stock | expiring
  const query = str(body.query);
  const days = Math.min(Math.max(Number(body.days ?? 30) || 30, 1), 365);
  const like = query ? `%${query}%` : null;

  const rows = filter === "low_stock"
    ? await sql`
        SELECT i.id, i.name, i.sku, i.lot_number, i.quantity, i.unit, i.reorder_point, i.expires_at
        FROM inventory_items i
        WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
          AND i.quantity <= i.reorder_point
          AND (${like}::text IS NULL OR i.name ILIKE ${like} OR i.sku ILIKE ${like})
        ORDER BY (i.reorder_point - i.quantity) DESC, i.name ASC
        LIMIT 25
      `
    : filter === "expiring"
      ? await sql`
          SELECT i.id, i.name, i.sku, i.lot_number, i.quantity, i.unit, i.reorder_point, i.expires_at
          FROM inventory_items i
          WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
            AND i.expires_at IS NOT NULL AND i.expires_at <= (CURRENT_DATE + ${days}::int)
            AND i.quantity > 0
            AND (${like}::text IS NULL OR i.name ILIKE ${like} OR i.sku ILIKE ${like})
          ORDER BY i.expires_at ASC
          LIMIT 25
        `
      : await sql`
          SELECT i.id, i.name, i.sku, i.lot_number, i.quantity, i.unit, i.reorder_point, i.expires_at
          FROM inventory_items i
          WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
            AND (${like}::text IS NULL OR i.name ILIKE ${like} OR i.sku ILIKE ${like})
          ORDER BY i.name ASC
          LIMIT 25
        `;

  const items = (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    lot: r.lot_number,
    quantity: Number(r.quantity),
    unit: r.unit,
    reorderPoint: Number(r.reorder_point),
    expiresAt: r.expires_at,
  }));
  return ok({ linked: true, laboratory: session.laboratoryName, filter, count: items.length, items });
}

async function handleEquipmentList(user: DiloLinkedUser, body: Body) {
  const resolved = await sessionForLabQuery(user, str(body.laboratory), "equipment.view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;
  const sql = getSql();

  const filter = str(body.filter) ?? "all"; // all | attention
  const rows = filter === "attention"
    ? await sql`
        SELECT e.id, e.name, e.code, e.status, e.last_calibration_at, e.next_maintenance_at
        FROM equipment e
        WHERE e.laboratory_id = ${session.laboratoryId}
          AND (e.status <> 'OPERATIONAL' OR (e.next_maintenance_at IS NOT NULL AND e.next_maintenance_at <= (CURRENT_DATE + 30)))
        ORDER BY e.next_maintenance_at ASC NULLS LAST, e.name ASC
        LIMIT 25
      `
    : await sql`
        SELECT e.id, e.name, e.code, e.status, e.last_calibration_at, e.next_maintenance_at
        FROM equipment e
        WHERE e.laboratory_id = ${session.laboratoryId}
        ORDER BY e.name ASC
        LIMIT 25
      `;

  const equipment = (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    status: r.status,
    lastCalibrationAt: r.last_calibration_at,
    nextMaintenanceAt: r.next_maintenance_at,
  }));
  return ok({ linked: true, laboratory: session.laboratoryName, filter, count: equipment.length, equipment });
}

async function handleSpecimensList(user: DiloLinkedUser, body: Body) {
  const resolved = await sessionForLabQuery(user, str(body.laboratory), "specimens.view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;
  const sql = getSql();

  const status = str(body.status);
  const query = str(body.query);
  const like = query ? `%${query}%` : null;
  const rows = await sql`
    SELECT s.id, s.accession_number, s.status, s.workflow_state_key, s.priority, s.received_at, st.name AS specimen_type
    FROM specimens s
    JOIN specimen_types st ON st.id = s.specimen_type_id
    WHERE s.laboratory_id = ${session.laboratoryId}
      AND (${status}::text IS NULL OR s.status::text = upper(${status}))
      AND (${like}::text IS NULL OR s.accession_number ILIKE ${like} OR s.barcode ILIKE ${like})
    ORDER BY s.received_at DESC
    LIMIT 20
  `;

  const specimens = (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    accessionNumber: r.accession_number,
    type: r.specimen_type,
    status: r.workflow_state_key ?? r.status,
    priority: r.priority,
    receivedAt: r.received_at,
  }));
  return ok({ linked: true, laboratory: session.laboratoryName, count: specimens.length, specimens });
}

async function handleAlertsList(user: DiloLinkedUser, body: Body) {
  const resolved = await sessionForLabQuery(user, str(body.laboratory), "alerts.view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;
  const sql = getSql();

  // Mismo recorte que GET /api/alerts: un PROFESSOR solo ve alertas de SUS
  // prácticas/reservas; el resto de roles ve las del laboratorio completo.
  const rows = session.role === "PROFESSOR"
    ? await sql`
        SELECT a.id, a.severity, a.status, a.title, a.details, a.created_at
        FROM alerts a
        LEFT JOIN educational_practices ep ON ep.id = a.source_id AND a.source_type = 'EDUCATIONAL_PRACTICE' AND ep.laboratory_id = a.laboratory_id
        LEFT JOIN resource_reservations rr ON rr.id = a.source_id AND a.source_type = 'RESOURCE_RESERVATION' AND rr.laboratory_id = a.laboratory_id
        LEFT JOIN educational_practices rp ON rp.id = rr.practice_id AND rp.laboratory_id = a.laboratory_id
        WHERE a.laboratory_id = ${session.laboratoryId}
          AND a.status IN ('OPEN', 'ASSIGNED', 'ACKNOWLEDGED')
          AND COALESCE(ep.teacher_user_id, rp.teacher_user_id) = ${session.userId}
        ORDER BY a.created_at DESC
        LIMIT 20
      `
    : await sql`
        SELECT a.id, a.severity, a.status, a.title, a.details, a.created_at
        FROM alerts a
        WHERE a.laboratory_id = ${session.laboratoryId}
          AND a.status IN ('OPEN', 'ASSIGNED', 'ACKNOWLEDGED')
        ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END, a.created_at DESC
        LIMIT 20
      `;

  const alerts = (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    severity: r.severity,
    status: r.status,
    title: r.title,
    details: typeof r.details === "string" && r.details.length > 220 ? `${r.details.slice(0, 220)}…` : r.details,
    createdAt: r.created_at,
  }));
  return ok({ linked: true, laboratory: session.laboratoryName, count: alerts.length, alerts });
}

function isMutationAction(action: string): action is DiloMutationAction {
  return (DILO_MUTATION_ACTIONS as readonly string[]).includes(action);
}

function isReadAction(action: string): action is DiloReadAction {
  return (DILO_READ_ACTIONS as readonly string[]).includes(action);
}

async function handleNativeRead(user: DiloLinkedUser, body: Body, action: DiloReadAction) {
  const resolved = await sessionForLabMembership(user, str(body.laboratory));
  if ("response" in resolved) return resolved.response;
  const result = await runDiloNativeRead({ session: resolved.session, action });
  if (!result.ok) {
    return ok({
      linked: true,
      error: result.status === 403 ? "no_permission" : "query_failed",
      status: result.status,
      message: result.body.message ?? "NexaLab rechazó la consulta.",
    });
  }
  const rows = Array.isArray(result.body.data) ? result.body.data : [];
  return ok({ linked: true, action, laboratory: resolved.session.laboratoryName, count: rows.length, items: rows });
}

async function handleMutation(user: DiloLinkedUser, body: Body, action: DiloMutationAction) {
  const resolved = await sessionForLabMembership(user, str(body.laboratory));
  if ("response" in resolved) return resolved.response;
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input)
    ? body.input as Record<string, unknown>
    : {};
  const result = await runDiloNativeMutation({
    session: resolved.session,
    action,
    id: str(body.id),
    input,
  });
  if (!result.ok) {
    return ok({
      linked: true,
      error: result.status === 403 ? "no_permission" : "operation_failed",
      status: result.status,
      message: result.body.message ?? "NexaLab rechazó la operación.",
      issues: result.body.issues ?? null,
    });
  }
  return ok({
    linked: true,
    action,
    laboratory: resolved.session.laboratoryName,
    result: result.body.data ?? result.body,
  });
}

export async function POST(request: Request) {
  if (!isDiloBridgeConfigured() || !hasDatabase()) {
    return fail("El puente Dilo no está configurado en NexaLab.", 503);
  }

  const rawBody = await request.text();
  const signatureOk = verifyDiloSignature({
    timestamp: request.headers.get(DILO_TIMESTAMP_HEADER),
    rawBody,
    signatureHeader: request.headers.get(DILO_SIGNATURE_HEADER),
  });
  if (!signatureOk) return fail("Firma inválida.", 401);

  let body: Body;
  try {
    body = JSON.parse(rawBody) as Body;
  } catch {
    return fail("Cuerpo no es JSON válido.", 400);
  }

  const action = str(body.action);
  if (!action) return fail("Falta 'action'.", 400);

  try {
    // link.redeem es la única acción que NO exige vínculo previo (lo crea).
    if (action === "link.redeem") return await handleLinkRedeem(body);

    if (action === "link.status") {
      const user = await resolveLinkedUser(str(body.phone));
      return ok({ linked: Boolean(user), user: user ? { name: user.name } : null });
    }

    // El resto exige un teléfono vinculado. Sin vínculo → linked:false (Dilo explica cómo).
    const user = await resolveLinkedUser(str(body.phone));
    if (!user) {
      return ok({ linked: false, message: "Este número no está vinculado a una cuenta de NexaLab." });
    }

    if (isMutationAction(action)) return await handleMutation(user, body, action);
    if (isReadAction(action)) return await handleNativeRead(user, body, action);

    switch (action) {
      case "context":
        return await handleContext(user);
      case "inventory.list":
        return await handleInventoryList(user, body);
      case "equipment.list":
        return await handleEquipmentList(user, body);
      case "specimens.list":
        return await handleSpecimensList(user, body);
      case "alerts.list":
        return await handleAlertsList(user, body);
      default:
        return fail(`Acción desconocida: ${action}`, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del puente.";
    return fail(message, 400);
  }
}

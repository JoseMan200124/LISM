import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { consumeDemoAccessCode, findDemoQrLabelByToken, hashAccessCode, secureHashesEqual, type PublicQrProfile } from "@/lib/qr-security";

const schema = z.object({ code: z.string().regex(/^\d{6}$/, "Ingresa los seis dígitos del código temporal.") });

// La etiqueta la lee alguien de pie frente al frasco o al equipo: las fechas
// tienen que verse como fechas, no como el `toString()` de un objeto Date.
// Las columnas DATE llegan ya normalizadas a "YYYY-MM-DD" desde el SELECT; los
// timestamps se convierten a ISO antes de formatear.
function dateText(value: unknown, fallback: string): string {
  if (!value) return fallback;
  return formatDate(value);
}
function momentText(value: unknown): string {
  if (!value) return "—";
  return formatDateTime(value instanceof Date ? value.toISOString() : value);
}

const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: "Operativo",
  MAINTENANCE_DUE: "Mantenimiento próximo",
  OUT_OF_SERVICE: "Fuera de servicio",
  RETIRED: "Inactivo",
};
const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Entrada", CONSUMPTION: "Consumo", ADJUSTMENT: "Ajuste",
  DISPOSAL: "Descarte", TRANSFER: "Transferencia", RETURN: "Devolución",
};
const EQUIPMENT_EVENT_LABEL: Record<string, string> = {
  VERIFICATION: "Verificación", CALIBRATION: "Calibración", MAINTENANCE: "Mantenimiento",
  QUALIFICATION: "Calificación", REPAIR: "Reparación", CLEANING: "Limpieza",
};

async function loadDatabaseProfile(sql: ReturnType<typeof getSql>, laboratoryId: string, entityType: string, entityId: string, labelCode: string): Promise<PublicQrProfile | null> {
  if (entityType === "INVENTORY_ITEM") {
    const rows = await sql`
      SELECT i.sku, i.name, c.name AS category, i.vendor, i.lot_number, i.quantity, i.reorder_point, i.unit,
        to_char(i.expires_at, 'YYYY-MM-DD') AS expires_at, COALESCE(l.name, 'Sin ubicación') AS location, i.internal_formula,
        COALESCE(u.full_name, 'Laboratorio') AS responsible,
        CASE WHEN i.quantity <= i.reorder_point THEN 'Reponer' WHEN i.expires_at IS NOT NULL AND i.expires_at <= current_date + interval '30 day' THEN 'Vigilar' ELSE 'Disponible' END AS display_status
      FROM inventory_items i
      JOIN inventory_categories c ON c.id = i.category_id
      LEFT JOIN storage_locations l ON l.id = i.storage_location_id
      LEFT JOIN users u ON u.id = i.created_by
      WHERE i.id = ${entityId} AND i.laboratory_id = ${laboratoryId} LIMIT 1`;
    const item = rows[0] as Record<string, unknown> | undefined;
    if (!item) return null;
    const movements = await sql`
      SELECT m.movement_type, m.quantity_delta, m.reason_code, m.performed_at, COALESCE(u.full_name, 'Sistema') AS performed_by
      FROM inventory_movements m LEFT JOIN users u ON u.id = m.performed_by
      WHERE m.inventory_item_id = ${entityId} AND m.laboratory_id = ${laboratoryId}
      ORDER BY m.performed_at DESC LIMIT 6`;
    return {
      entityType: "INVENTORY_ITEM",
      labelCode,
      name: String(item.name),
      status: String(item.display_status),
      location: String(item.location),
      // El responsable es quien registró el lote en el laboratorio. El proveedor
      // es otra cosa y va en el resumen, con su propia etiqueta.
      responsible: String(item.responsible),
      summary: [
        { label: "Categoría", value: String(item.category) },
        { label: "Proveedor", value: String(item.vendor ?? "") || "No registrado" },
        { label: "Fórmula", value: String(item.internal_formula ?? "") || "No registrada" },
        { label: "Lote", value: String(item.lot_number ?? "") || "Sin lote" },
        { label: "Existencia", value: `${item.quantity} ${item.unit}` },
        { label: "Stock mínimo", value: `${item.reorder_point} ${item.unit}` },
        { label: "Vencimiento", value: dateText(item.expires_at, "Sin vencimiento") },
      ],
      history: movements.map((movement) => ({
        title: MOVEMENT_TYPE_LABEL[String(movement.movement_type)] ?? String(movement.movement_type),
        detail: `${movement.quantity_delta} · ${movement.reason_code ?? "Movimiento"} · ${movement.performed_by}`,
        when: momentText(movement.performed_at),
      })),
      allowedActions: ["Consultar ficha", "Registrar consumo desde NexaLab", "Transferir desde NexaLab", "Reportar incidencia"],
    };
  }
  if (entityType === "EQUIPMENT") {
    // Las próximas fechas salen del plan periódico activo cuando existe; si el
    // equipo aún no tiene plan, se usa la fecha capturada en su ficha.
    const rows = await sql`
      SELECT e.code, e.name, e.manufacturer, e.model, e.serial_number, e.status,
        to_char(e.last_calibration_at, 'YYYY-MM-DD') AS last_calibration_at,
        to_char(e.last_qualification_at, 'YYYY-MM-DD') AS last_qualification_at,
        to_char(e.last_maintenance_at, 'YYYY-MM-DD') AS last_maintenance_at,
        to_char(COALESCE(p.next_calibration_at::date, e.next_calibration_at), 'YYYY-MM-DD') AS next_calibration_at,
        to_char(COALESCE(p.next_qualification_at::date, e.next_qualification_at), 'YYYY-MM-DD') AS next_qualification_at,
        to_char(COALESCE(p.next_maintenance_at::date, e.next_maintenance_at), 'YYYY-MM-DD') AS next_maintenance_at,
        COALESCE(l.name, 'Sin ubicación') AS location, COALESCE(u.full_name, 'Laboratorio') AS responsible
      FROM equipment e
      LEFT JOIN storage_locations l ON l.id = e.storage_location_id
      LEFT JOIN users u ON u.id = e.responsible_user_id
      LEFT JOIN (
        SELECT equipment_id,
          MIN(next_due_at) FILTER (WHERE plan_type = 'CALIBRATION') AS next_calibration_at,
          MIN(next_due_at) FILTER (WHERE plan_type = 'MAINTENANCE') AS next_maintenance_at,
          MIN(next_due_at) FILTER (WHERE plan_type = 'QUALIFICATION') AS next_qualification_at
        FROM equipment_plans
        WHERE laboratory_id = ${laboratoryId} AND status = 'ACTIVE'
        GROUP BY equipment_id
      ) p ON p.equipment_id = e.id
      WHERE e.id = ${entityId} AND e.laboratory_id = ${laboratoryId} LIMIT 1`;
    const equipment = rows[0] as Record<string, unknown> | undefined;
    if (!equipment) return null;
    const events = await sql`
      SELECT event_type, details, COALESCE(completed_at, scheduled_for, created_at) AS happened_at
      FROM equipment_events WHERE equipment_id = ${entityId} AND laboratory_id = ${laboratoryId}
      ORDER BY happened_at DESC LIMIT 6`;
    return {
      entityType: "EQUIPMENT",
      labelCode,
      name: String(equipment.name),
      status: EQUIPMENT_STATUS_LABEL[String(equipment.status)] ?? String(equipment.status),
      location: String(equipment.location),
      responsible: String(equipment.responsible),
      summary: [
        { label: "Marca", value: String(equipment.manufacturer ?? "") || "No registrada" },
        { label: "Modelo", value: String(equipment.model ?? "") || "No registrado" },
        { label: "Serie", value: String(equipment.serial_number ?? "") || "No registrada" },
        { label: "Última calibración", value: dateText(equipment.last_calibration_at, "Sin registro") },
        { label: "Próxima calibración", value: dateText(equipment.next_calibration_at, "Sin programación") },
        { label: "Última calificación", value: dateText(equipment.last_qualification_at, "Sin registro") },
        { label: "Próxima calificación", value: dateText(equipment.next_qualification_at, "Sin programación") },
        { label: "Último mantenimiento", value: dateText(equipment.last_maintenance_at, "Sin registro") },
        { label: "Próximo mantenimiento", value: dateText(equipment.next_maintenance_at, "Sin programación") },
      ],
      history: events.map((event) => ({
        title: EQUIPMENT_EVENT_LABEL[String(event.event_type)] ?? String(event.event_type),
        detail: String(event.details ?? "Evento de equipo"),
        when: momentText(event.happened_at),
      })),
      allowedActions: ["Consultar ficha", "Registrar verificación desde NexaLab", "Reportar mantenimiento", "Abrir incidencia"],
    };
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Ingresa un código temporal válido de seis dígitos." }, { status: 400 });
  const { token } = await params;
  const { code } = parsed.data;

  if (!hasDatabase()) {
    const label = findDemoQrLabelByToken(token);
    if (!label) return NextResponse.json({ message: "Etiqueta no encontrada o inactiva." }, { status: 404 });
    const verification = consumeDemoAccessCode(label.id, code);
    if (!verification.ok) return NextResponse.json({ message: verification.message }, { status: 401 });
    return NextResponse.json({ data: label.profile, mode: "demo" });
  }

  const sql = getSql();
  const labels = await sql`SELECT id, laboratory_id, entity_type, entity_id, label_code FROM qr_identifiers WHERE opaque_token = ${token} AND status = 'ACTIVE' LIMIT 1`;
  const label = labels[0] as Record<string, unknown> | undefined;
  if (!label) return NextResponse.json({ message: "Etiqueta no encontrada o inactiva." }, { status: 404 });
  const codes = await sql`
    SELECT id, code_hash, expires_at, consumed_at, attempt_count, max_attempts
    FROM qr_access_codes
    WHERE qr_identifier_id = ${String(label.id)} AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1`;
  const accessCode = codes[0] as Record<string, unknown> | undefined;
  if (!accessCode) return NextResponse.json({ message: "Solicita un código temporal desde NexaLab antes de consultar la etiqueta." }, { status: 401 });
  if (new Date(String(accessCode.expires_at)).getTime() <= Date.now()) return NextResponse.json({ message: "El código temporal venció. Genera uno nuevo desde NexaLab." }, { status: 401 });
  if (Number(accessCode.attempt_count) >= Number(accessCode.max_attempts)) return NextResponse.json({ message: "El código temporal fue bloqueado por intentos fallidos." }, { status: 401 });

  const matches = secureHashesEqual(String(accessCode.code_hash), hashAccessCode(String(label.id), code));
  if (!matches) {
    await sql`UPDATE qr_access_codes SET attempt_count = attempt_count + 1 WHERE id = ${String(accessCode.id)}`;
    await sql`INSERT INTO qr_scan_events (laboratory_id, qr_identifier_id, outcome, user_agent) VALUES (${String(label.laboratory_id)}, ${String(label.id)}, 'DENIED_BAD_CODE', ${request.headers.get("user-agent") ?? "unknown"})`;
    return NextResponse.json({ message: "Código temporal incorrecto." }, { status: 401 });
  }
  const consumed = await sql`
    UPDATE qr_access_codes SET consumed_at = now(), attempt_count = attempt_count + 1
    WHERE id = ${String(accessCode.id)} AND consumed_at IS NULL AND expires_at > now()
    RETURNING id`;
  if (!consumed[0]) return NextResponse.json({ message: "El código ya fue utilizado. Genera uno nuevo desde NexaLab." }, { status: 401 });
  await sql`INSERT INTO qr_scan_events (laboratory_id, qr_identifier_id, outcome, user_agent) VALUES (${String(label.laboratory_id)}, ${String(label.id)}, 'GRANTED', ${request.headers.get("user-agent") ?? "unknown"})`;
  const profile = await loadDatabaseProfile(sql, String(label.laboratory_id), String(label.entity_type), String(label.entity_id), String(label.label_code));
  if (!profile) return NextResponse.json({ message: "El recurso asociado ya no se encuentra disponible." }, { status: 404 });
  return NextResponse.json({ data: profile, mode: "database" });
}

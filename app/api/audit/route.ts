import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/authorization";
import { auditActionLabel, auditModuleLabel } from "@/lib/audit-modules";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

// Bitácora real (audit_logs). Antes el módulo mostraba filas de demostración,
// por lo que "algunas cosas no se registraban": ahora se consulta el registro
// append-only con responsable, módulo, valores y motivo, y se exporta a Excel.

const LIST_LIMIT = 400;
const EXPORT_LIMIT = 5000;

function compactJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return String(value);
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "audit.view")) return NextResponse.json({ message: "No tienes permiso para consultar la bitácora." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const url = new URL(request.url);
  const wantsXlsx = url.searchParams.get("format") === "xlsx";
  const limit = wantsXlsx ? EXPORT_LIMIT : LIST_LIMIT;

  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.previous_value, a.new_value,
      a.reason, a.metadata, a.ip_address, a.created_at,
      COALESCE(u.full_name, 'Sistema') AS actor_name, u.email AS actor_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.laboratory_id = ${session.laboratoryId}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  ` as Array<Record<string, unknown>>;

  const shaped = rows.map((row) => ({
    id: String(row.id),
    action: String(row.action ?? ""),
    action_label: auditActionLabel(row.action),
    module: auditModuleLabel(row.entity_type),
    entity_type: String(row.entity_type ?? ""),
    entity_id: row.entity_id ? String(row.entity_id) : null,
    actor_name: String(row.actor_name ?? "Sistema"),
    actor_email: row.actor_email ? String(row.actor_email) : null,
    previous_value: row.previous_value ?? null,
    new_value: row.new_value ?? null,
    reason: row.reason ? String(row.reason) : null,
    ip_address: row.ip_address ? String(row.ip_address) : null,
    created_at: String(row.created_at),
  }));

  if (!wantsXlsx) return NextResponse.json({ data: shaped, mode: "database" });

  const header: XlsxCell[] = ["Fecha y hora", "Usuario", "Correo", "Módulo", "Acción", "Registro", "Valor anterior", "Valor nuevo", "Motivo", "Origen (IP)"];
  const body: XlsxCell[][] = shaped.map((row) => [
    new Date(row.created_at).toLocaleString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    row.actor_name,
    row.actor_email ?? "",
    row.module,
    row.action_label,
    row.entity_id ?? "",
    compactJson(row.previous_value),
    compactJson(row.new_value),
    row.reason ?? "",
    row.ip_address ?? "",
  ]);
  const bytes = buildXlsx([header, ...body], "Bitácora");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nexalab-bitacora-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

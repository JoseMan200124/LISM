import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { flushPendingDeliveries } from "@/lib/integration-webhooks";

// Reintento manual de las entregas pendientes. Cuando el ERP estuvo caído y ya
// volvió, esto vacía la cola sin esperar al siguiente respiro del backoff.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const result = await flushPendingDeliveries(session.laboratoryId);
  return NextResponse.json({ data: result });
}

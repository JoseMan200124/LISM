import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ ok: true, mode: "demo", database: "not-configured" });
  }

  try {
    const sql = getSql();
    const rows = await sql`SELECT now() AS database_time`;
    return NextResponse.json({ ok: true, mode: "database", database: "connected", databaseTime: rows[0]?.database_time });
  } catch (error) {
    // Endpoint público sin autenticación (lo consulta el orquestador de
    // contenedores): el detalle real del error solo se expone en desarrollo,
    // para no filtrar detalles de infraestructura a cualquiera que lo
    // consulte (hallazgo #5 de la auditoría de seguridad).
    const message = error instanceof Error ? error.message : "Database unavailable";
    if (process.env.NODE_ENV === "development") console.error("[health] Error de base de datos:", message);
    return NextResponse.json(
      { ok: false, database: "error", message: "Database unavailable", detail: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 503 },
    );
  }
}

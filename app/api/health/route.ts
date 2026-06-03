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
    return NextResponse.json(
      { ok: false, database: "error", message: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 },
    );
  }
}

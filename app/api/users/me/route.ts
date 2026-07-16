import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  let organizationName: string | null = null;
  if (hasDatabase()) {
    const sql = getSql();
    const rows = await sql`SELECT name FROM organizations WHERE id = ${session.organizationId} LIMIT 1`;
    const org = rows[0] as { name?: string } | undefined;
    organizationName = org?.name ?? null;
  }

  return NextResponse.json({
    data: {
      userId: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      laboratoryName: session.laboratoryName,
      profileCode: session.profileCode,
      organizationName,
    },
  });
}

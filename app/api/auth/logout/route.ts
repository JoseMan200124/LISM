import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasDatabase } from "@/lib/db";
import { clearSessionCookie, getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  try {
    if (session && session.sessionMode !== "demo" && hasDatabase()) {
      await writeAuditEvent(session, {
        action: "USER_LOGOUT",
        entityType: "user_session",
        entityId: session.userId,
        previousValue: { laboratoryId: session.laboratoryId, role: session.role },
        reason: "Cierre de sesión",
        request,
      });
    }
  } finally {
    await clearSessionCookie();
  }
  return NextResponse.json({ ok: true });
}

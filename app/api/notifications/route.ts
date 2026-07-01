import { NextResponse } from "next/server";
import { resolveNotifications } from "@/lib/notifications";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const { data, mode } = await resolveNotifications(session);
  const unreadCount = data.filter((item) => !item.isRead).length;

  return NextResponse.json({ data, unreadCount, mode });
}

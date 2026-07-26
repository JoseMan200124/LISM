import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { isExpoPushToken, isMissingPushMigration, registerPushDevice, unregisterPushDevice } from "@/lib/push";

const registerSchema = z.object({
  token: z.string().min(10).max(300).refine(isExpoPushToken, "Token de notificaciones inválido."),
  platform: z.enum(["ios", "android", "web"]).optional(),
  deviceName: z.string().max(160).optional(),
  appVersion: z.string().max(40).optional(),
});

const deleteSchema = z.object({
  token: z.string().min(10).max(300),
});

/** Alta o actualización del dispositivo que recibirá las notificaciones push. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await registerPushDevice(session, parsed.data);
    return NextResponse.json({ data: result });
  } catch (error) {
    if (isMissingPushMigration(error)) {
      return NextResponse.json({ data: { registered: false, reason: "MIGRATION_PENDING" } });
    }
    console.error("[api/push/devices] POST", error);
    return NextResponse.json({ message: "No se pudo registrar el dispositivo." }, { status: 500 });
  }
}

/** Baja del dispositivo al cerrar sesión en la app. */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Datos inválidos." }, { status: 400 });

  try {
    await unregisterPushDevice(session, parsed.data.token);
  } catch (error) {
    if (!isMissingPushMigration(error)) console.error("[api/push/devices] DELETE", error);
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

// Firma electrónica del usuario: el nombre con el que firma, sus credenciales
// profesionales y la rúbrica que se estampa en los registros firmados.
// No es una credencial de acceso: la autenticidad del acto la sigue dando la
// reautenticación con contraseña en el momento de firmar.

const MAX_IMAGE_LENGTH = 300_000; // ~220 KB en base64: de sobra para un trazo.

const schema = z.object({
  displayName: z.string().min(3).max(200),
  credentials: z.string().max(200).optional().nullable(),
  signatureImage: z
    .string()
    .max(MAX_IMAGE_LENGTH)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "La rúbrica debe ser una imagen válida.")
    .optional()
    .nullable(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ data: null, mode: "guest" });
  if (!hasDatabase()) {
    return NextResponse.json({ data: { display_name: session.name, credentials: null, signature_image: null }, mode: "demo" });
  }
  const sql = getSql();
  const rows = await sql`
    SELECT user_id, display_name, credentials, signature_image, updated_at
    FROM user_signature_profiles WHERE user_id = ${session.userId} LIMIT 1
  `;
  return NextResponse.json({ data: rows[0] ?? null, mode: "database" });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Un invitado no puede registrar una firma." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos de tu firma.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { display_name: payload.displayName, credentials: payload.credentials ?? null, signature_image: payload.signatureImage ?? null }, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    INSERT INTO user_signature_profiles (user_id, laboratory_id, display_name, credentials, signature_image)
    VALUES (${session.userId}, ${session.laboratoryId}, ${payload.displayName}, ${payload.credentials ?? null}, ${payload.signatureImage ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      laboratory_id = EXCLUDED.laboratory_id,
      display_name = EXCLUDED.display_name,
      credentials = EXCLUDED.credentials,
      signature_image = EXCLUDED.signature_image,
      updated_at = now()
    RETURNING user_id, display_name, credentials, signature_image, updated_at
  `;
  await writeAuditEvent(session, {
    action: "USER_SIGNATURE_UPDATED",
    entityType: "user_signature_profile",
    entityId: session.userId,
    newValue: { displayName: payload.displayName, credentials: payload.credentials ?? null, hasImage: Boolean(payload.signatureImage) },
    reason: "Actualización de la firma electrónica del usuario",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ ok: true, mode: "demo" });
  const sql = getSql();
  // Se borra la rúbrica, no las firmas ya estampadas: esas son inmutables.
  await sql`UPDATE user_signature_profiles SET signature_image = NULL, updated_at = now() WHERE user_id = ${session.userId}`;
  await writeAuditEvent(session, {
    action: "USER_SIGNATURE_IMAGE_REMOVED",
    entityType: "user_signature_profile",
    entityId: session.userId,
    reason: "Eliminación de la rúbrica registrada",
    request,
  });
  return NextResponse.json({ ok: true });
}

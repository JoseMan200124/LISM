import { NextResponse } from "next/server";
import { permissionsByRole } from "@/lib/authorization";
import { createSessionToken, getSession, SESSION_TTL_SECONDS } from "@/lib/session";

/**
 * Renueva el token de sesión de un cliente nativo y devuelve la sesión
 * completa (incluidos los permisos efectivos) para que la app móvil pueda
 * ocultar módulos y acciones con la misma matriz que usa la web.
 *
 * No amplía privilegios: exige una sesión válida y vuelve a firmar
 * exactamente los mismos datos.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const token = await createSessionToken(session);

  return NextResponse.json({
    token,
    expiresInSeconds: SESSION_TTL_SECONDS,
    session: {
      userId: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      organizationId: session.organizationId,
      laboratoryId: session.laboratoryId,
      laboratoryName: session.laboratoryName,
      profileCode: session.profileCode,
      sessionMode: session.sessionMode,
      permissions: session.permissions ?? permissionsByRole[session.role] ?? [],
    },
  });
}

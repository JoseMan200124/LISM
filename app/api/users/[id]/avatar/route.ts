import { NextResponse } from "next/server";
import { downloadImage, hasBlobStorage } from "@/lib/blob-storage";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

// Proxy autenticado: el contenedor de Blob Storage es privado (sin acceso
// público ni SAS), así que las imágenes nunca se sirven con una URL directa.
// Solo se puede pedir el avatar de un usuario que pertenezca a la MISMA
// organización que la sesión activa — aislamiento entre instituciones.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasBlobStorage() || !hasDatabase()) return NextResponse.json({ message: "No disponible." }, { status: 404 });

  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const sql = getSql();
  const membershipRows = await sql`
    SELECT 1 FROM memberships
    WHERE user_id = ${id} AND organization_id = ${session.organizationId}
    LIMIT 1
  `;
  if (membershipRows.length === 0) return NextResponse.json({ message: "No encontrado." }, { status: 404 });

  const attachmentRows = await sql`
    SELECT storage_key FROM attachments
    WHERE entity_type = 'user_avatar' AND entity_id = ${id}
    ORDER BY version_number DESC LIMIT 1
  `;
  const attachment = attachmentRows[0] as { storage_key: string } | undefined;
  if (!attachment) return NextResponse.json({ message: "Sin avatar." }, { status: 404 });

  const image = await downloadImage(attachment.storage_key).catch(() => null);
  if (!image) return NextResponse.json({ message: "No disponible." }, { status: 404 });

  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}

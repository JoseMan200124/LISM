import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { AI_ALLOWED_TYPES, AI_MAX_BYTES, extractTechnicalSheet, hasAI } from "@/lib/ai";
import { getSession } from "@/lib/session";

// Digitalización de fichas técnicas/de seguridad con IA. Recibe el documento
// (PDF o imagen), lo envía a Claude para extraer datos estructurados y los
// devuelve para precargar el formulario de alta de inventario. No persiste
// nada: solo lee el archivo en memoria y responde con los campos extraídos.

// Indica si la digitalización con IA está disponible para el usuario actual,
// para que la UI muestre u oculte la sección sin exponer la configuración.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  return NextResponse.json({ enabled: hasAI() && hasPermission(session, "inventory.manage") });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "No tienes permiso para registrar inventario." }, { status: 403 });
  if (!hasAI()) return NextResponse.json({ message: "La digitalización con IA no está configurada. Define ANTHROPIC_API_KEY para habilitarla." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Envía el documento como formulario (multipart)." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ message: "Adjunta la ficha técnica o de seguridad (PDF o imagen)." }, { status: 400 });
  }
  if (!AI_ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ message: "Formato no admitido. Usa un PDF o una imagen (PNG, JPG o WebP)." }, { status: 400 });
  }
  if (file.size > AI_MAX_BYTES) {
    return NextResponse.json({ message: "El archivo supera el máximo de 15 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await extractTechnicalSheet({ buffer, mimeType: file.type });
    await writeAuditEvent(session, {
      action: "INVENTORY_SHEET_DIGITIZED",
      entityType: "inventory_item",
      reason: "Digitalización de ficha técnica con IA",
      metadata: { filename: file.name, size: file.size, mimeType: file.type },
      request,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api/inventory/digitize-sheet] POST", error);
    return NextResponse.json({ message: "No se pudo leer la ficha con IA. Verifica que el documento sea legible e intenta de nuevo." }, { status: 502 });
  }
}

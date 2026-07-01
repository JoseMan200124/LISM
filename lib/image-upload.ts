const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ValidatedImage = { buffer: Buffer; ext: string; mimeType: string };
export type ValidationResult = { ok: true; image: ValidatedImage } | { ok: false; message: string };

/**
 * Valida un archivo de imagen subido por el usuario (avatar o logo
 * institucional): solo PNG/JPEG/WebP, tamaño máximo, y verifica que los
 * primeros bytes reales coincidan con el tipo declarado (evita que un
 * archivo malicioso con extensión falsa pase la validación de MIME type
 * del navegador). SVG y cualquier otro formato quedan explícitamente
 * rechazados — no se ejecuta ni se interpreta como HTML/script en ningún
 * punto de la aplicación.
 */
export async function validateImageFile(file: File, maxBytes: number): Promise<ValidationResult> {
  if (!(file instanceof File)) return { ok: false, message: "Archivo inválido." };
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > maxBytes) return { ok: false, message: `El archivo supera el tamaño máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB).` };

  const ext = ALLOWED_MIME_TO_EXT[file.type];
  if (!ext) return { ok: false, message: "Formato no permitido. Usa PNG, JPEG o WebP." };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidMagicBytes(buffer, file.type)) {
    return { ok: false, message: "El contenido del archivo no corresponde al tipo declarado." };
  }

  return { ok: true, image: { buffer, ext, mimeType: file.type } };
}

function hasValidMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    );
  }
  return false;
}

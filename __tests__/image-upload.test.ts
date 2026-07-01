import { describe, expect, it } from "vitest";
import { validateImageFile } from "@/lib/image-upload";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_MAGIC = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
]);

function makeFile(bytes: Buffer, name: string, type: string): File {
  return new File([bytes], name, { type });
}

describe("validateImageFile", () => {
  it("acepta un PNG real con magic bytes correctos", async () => {
    const result = await validateImageFile(makeFile(PNG_1X1, "avatar.png", "image/png"), 2 * 1024 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.image.ext).toBe("png");
  });

  it("acepta un JPEG con magic bytes correctos", async () => {
    const result = await validateImageFile(makeFile(JPEG_MAGIC, "avatar.jpg", "image/jpeg"), 2 * 1024 * 1024);
    expect(result.ok).toBe(true);
  });

  it("acepta un WebP con magic bytes correctos", async () => {
    const result = await validateImageFile(makeFile(WEBP_MAGIC, "avatar.webp", "image/webp"), 2 * 1024 * 1024);
    expect(result.ok).toBe(true);
  });

  it("rechaza un archivo con extensión falsa (contenido no coincide con el MIME declarado)", async () => {
    const fakeText = Buffer.from("esto no es una imagen");
    const result = await validateImageFile(makeFile(fakeText, "avatar.png", "image/png"), 2 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("rechaza SVG explícitamente", async () => {
    const svg = Buffer.from("<svg onload='alert(1)'></svg>");
    const result = await validateImageFile(makeFile(svg, "logo.svg", "image/svg+xml"), 2 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("rechaza archivos que exceden el tamaño máximo", async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(3 * 1024 * 1024)]);
    const result = await validateImageFile(makeFile(big, "avatar.png", "image/png"), 2 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("rechaza un archivo vacío", async () => {
    const result = await validateImageFile(makeFile(Buffer.alloc(0), "avatar.png", "image/png"), 2 * 1024 * 1024);
    expect(result.ok).toBe(false);
  });
});

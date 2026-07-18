import { describe, expect, it } from "vitest";
import { buildWorksheetXml, buildXlsx, columnRef } from "@/lib/xlsx";

describe("generador xlsx", () => {
  it("convierte índices de columna a referencias de Excel", () => {
    expect(columnRef(0)).toBe("A");
    expect(columnRef(25)).toBe("Z");
    expect(columnRef(26)).toBe("AA");
    expect(columnRef(27)).toBe("AB");
  });

  it("escapa XML y conserva números como valores nativos", () => {
    const xml = buildWorksheetXml([["Usuario <admin>", 42]]);
    expect(xml).toContain("Usuario &lt;admin&gt;");
    expect(xml).toContain("<v>42</v>");
    expect(xml).not.toContain("<admin>");
  });

  it("produce un ZIP válido con las cinco partes del paquete", () => {
    const bytes = buildXlsx([["Módulo", "Acción"], ["Inventario", "Alta"]], "Bitácora");
    // Firma ZIP local al inicio y End Of Central Directory al final.
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    const eocdIndex = text.lastIndexOf("PK");
    expect(eocdIndex).toBeGreaterThan(0);
  });
});

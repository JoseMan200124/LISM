import { describe, expect, it } from "vitest";
import { missingRequiredFields, slugifyFieldKey, uniqueFieldKey, type CustomFieldDefinition } from "@/lib/custom-fields";

describe("slugifyFieldKey", () => {
  it("normaliza acentos y espacios", () => {
    expect(slugifyFieldKey("Fecha de descarte")).toBe("cf_fecha_de_descarte");
    expect(slugifyFieldKey("Concentración (%)")).toBe("cf_concentracion");
  });
  it("cae a cf_campo si queda vacío", () => {
    expect(slugifyFieldKey("!!!")).toBe("cf_campo");
  });
});

describe("uniqueFieldKey", () => {
  it("devuelve base si no colisiona", () => {
    expect(uniqueFieldKey("Lote", [])).toBe("cf_lote");
  });
  it("agrega sufijo al colisionar", () => {
    expect(uniqueFieldKey("Lote", ["cf_lote"])).toBe("cf_lote_2");
    expect(uniqueFieldKey("Lote", ["cf_lote", "cf_lote_2"])).toBe("cf_lote_3");
  });
});

describe("missingRequiredFields", () => {
  const defs: CustomFieldDefinition[] = [
    { id: "1", module_key: "inventory", field_key: "cf_a", label: "A", field_type: "TEXT", required_mode: "REQUIRED", status: "ACTIVE" },
    { id: "2", module_key: "inventory", field_key: "cf_b", label: "B", field_type: "TEXT", required_mode: "OPTIONAL", status: "ACTIVE" },
    { id: "3", module_key: "inventory", field_key: "cf_c", label: "C", field_type: "TEXT", required_mode: "REQUIRED", status: "ARCHIVED" },
  ];
  it("detecta obligatorio faltante", () => {
    expect(missingRequiredFields(defs, {})).toEqual(["cf_a"]);
    expect(missingRequiredFields(defs, { cf_a: "" })).toEqual(["cf_a"]);
    expect(missingRequiredFields(defs, { cf_a: "  " })).toEqual(["cf_a"]);
  });
  it("acepta obligatorio presente e ignora opcional y archivado", () => {
    expect(missingRequiredFields(defs, { cf_a: "x" })).toEqual([]);
  });
});

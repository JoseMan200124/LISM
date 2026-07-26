import { describe, expect, it } from "vitest";
import {
  GHS_PICTOGRAMS,
  ghsPictogram,
  isGhsCode,
  normalizePictograms,
  normalizeSafetyProcedures,
  resolveSafetyGuidance,
} from "@/lib/ghs";

describe("pictogramas SGA/GHS", () => {
  it("define los nueve pictogramas oficiales", () => {
    expect(GHS_PICTOGRAMS).toHaveLength(9);
    expect(GHS_PICTOGRAMS.map((pictogram) => pictogram.code)).toEqual([
      "GHS01", "GHS02", "GHS03", "GHS04", "GHS05", "GHS06", "GHS07", "GHS08", "GHS09",
    ]);
  });

  it("cada pictograma trae significado, ejemplos, emergencia y EPP", () => {
    for (const pictogram of GHS_PICTOGRAMS) {
      expect(pictogram.name.length).toBeGreaterThan(3);
      expect(pictogram.meaning.length).toBeGreaterThan(20);
      expect(pictogram.examples.length).toBeGreaterThan(10);
      expect(pictogram.emergency.length).toBeGreaterThan(30);
      expect(pictogram.ppe.length).toBeGreaterThan(10);
    }
  });

  it("reconoce códigos válidos e ignora los que no lo son", () => {
    expect(isGhsCode("GHS05")).toBe(true);
    expect(isGhsCode("GHS10")).toBe(false);
    expect(isGhsCode(5)).toBe(false);
    expect(ghsPictogram("GHS06")?.name).toBe("Toxicidad aguda");
    expect(ghsPictogram("nada")).toBeUndefined();
  });

  it("normaliza la lista guardada: descarta basura, deduplica y ordena", () => {
    expect(normalizePictograms(["ghs07", "GHS02", "GHS02", "no-existe", 7])).toEqual(["GHS02", "GHS07"]);
    expect(normalizePictograms(null)).toEqual([]);
    expect(normalizePictograms('["GHS05"]')).toEqual(["GHS05"]);
    expect(normalizePictograms("texto suelto")).toEqual([]);
  });

  it("normaliza los procedimientos descartando claves desconocidas y vacías", () => {
    const result = normalizeSafetyProcedures({ firstAid: " Lavar con agua ", spill: "   ", otra: "x" });
    expect(result).toEqual({ firstAid: "Lavar con agua" });
    expect(normalizeSafetyProcedures(["array"])).toEqual({});
    expect(normalizeSafetyProcedures(null)).toEqual({});
  });
});

describe("guía de seguridad resuelta", () => {
  it("da prioridad al procedimiento escrito por el laboratorio", () => {
    const guidance = resolveSafetyGuidance(["GHS02"], { firstAid: "Protocolo interno del laboratorio" });
    const firstAid = guidance.find((entry) => entry.key === "firstAid");
    expect(firstAid?.text).toBe("Protocolo interno del laboratorio");
    expect(firstAid?.source).toBe("lab");
  });

  it("rellena con la guía general del pictograma cuando el laboratorio no escribió nada", () => {
    const guidance = resolveSafetyGuidance(["GHS05"], {});
    const firstAid = guidance.find((entry) => entry.key === "firstAid");
    expect(firstAid?.source).toBe("ghs");
    expect(firstAid?.text).toContain("Corrosivo");
  });

  it("sin pictogramas ni procedimientos no inventa contenido", () => {
    expect(resolveSafetyGuidance([], {})).toEqual([]);
  });

  it("combina la guía de varios pictogramas declarados", () => {
    const guidance = resolveSafetyGuidance(["GHS02", "GHS06"], {});
    const ppe = guidance.find((entry) => entry.key === "ppe");
    expect(ppe?.text).toContain("Inflamable");
    expect(ppe?.text).toContain("Toxicidad aguda");
  });
});

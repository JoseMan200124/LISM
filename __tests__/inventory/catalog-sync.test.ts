import { describe, expect, it } from "vitest";
import { catalogCategoryFor, needsCatalogEntry } from "@/lib/reagent-catalog-sync";
import { inventoryCategoryPrefix } from "@/lib/lab-profile";

describe("categoría de catálogo derivada del frasco", () => {
  it("un artículo sin control queda como no controlado", () => {
    expect(catalogCategoryFor({ isControlled: false, controlKind: null })).toBe("UNCONTROLLED");
  });

  it("cada tipo de control se traduce a su categoría del catálogo", () => {
    expect(catalogCategoryFor({ isControlled: true, controlKind: "DUAL_USE" })).toBe("DUAL_USE");
    expect(catalogCategoryFor({ isControlled: true, controlKind: "PRECURSOR" })).toBe("PRECURSOR");
  });

  it("doble uso y precursor a la vez se trata como controlado", () => {
    expect(catalogCategoryFor({ isControlled: true, controlKind: "BOTH" })).toBe("CONTROLLED");
  });

  it("marcado como controlado sin tipo declarado sigue siendo controlado", () => {
    expect(catalogCategoryFor({ isControlled: true, controlKind: null })).toBe("CONTROLLED");
  });
});

describe("qué artículos llevan ficha de catálogo", () => {
  it("reactivos y medios de cultivo la llevan", () => {
    expect(needsCatalogEntry({ itemType: "REAGENT", isControlled: false })).toBe(true);
    expect(needsCatalogEntry({ itemType: "CULTURE_MEDIA", isControlled: false })).toBe(true);
  });

  it("el material y los consumibles no la llevan", () => {
    expect(needsCatalogEntry({ itemType: "MATERIAL", isControlled: false })).toBe(false);
    expect(needsCatalogEntry({ itemType: "CONSUMABLE", isControlled: false })).toBe(false);
    expect(needsCatalogEntry({ itemType: "OTHER", isControlled: false })).toBe(false);
  });

  it("cualquier artículo controlado la lleva, sea del tipo que sea", () => {
    expect(needsCatalogEntry({ itemType: "OTHER", isControlled: true })).toBe(true);
  });
});

describe("prefijo de una categoría creada al vuelo", () => {
  it("toma las iniciales cuando el nombre tiene varias palabras", () => {
    expect(inventoryCategoryPrefix("Reactivos de microbiología")).toBe("RDM");
  });

  it("usa las primeras letras cuando es una sola palabra", () => {
    expect(inventoryCategoryPrefix("Reactivos")).toBe("REAC");
  });

  it("ignora acentos y signos", () => {
    expect(inventoryCategoryPrefix("Ácidos / bases")).toBe("AB");
  });

  it("nunca pasa de ocho caracteres", () => {
    expect(inventoryCategoryPrefix("a b c d e f g h i j k").length).toBeLessThanOrEqual(8);
  });

  it("un nombre sin letras ni números cae a un prefijo genérico", () => {
    expect(inventoryCategoryPrefix("///")).toBe("CAT");
  });
});

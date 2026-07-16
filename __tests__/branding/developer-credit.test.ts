import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeveloperCredit, HARICODE_URL } from "@/components/developer-credit";

describe("crédito de desarrollo", () => {
  it("enlaza Haricode de forma visible y segura", () => {
    const html = renderToStaticMarkup(DeveloperCredit({ variant: "default" }));

    expect(html).toContain(`href="${HARICODE_URL}"`);
    expect(html).toContain("Diseñado y desarrollado por");
    expect(html).toContain("Haricode");
    expect(html).toContain("Software &amp; UI/UX");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
  });
});

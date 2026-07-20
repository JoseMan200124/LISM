import { describe, expect, it } from "vitest";
import { getSession, withServiceSession, type UserSession } from "@/lib/session";

function session(userId: string, laboratoryId: string): UserSession {
  return {
    userId,
    name: userId,
    email: `${userId}@example.test`,
    role: "ANALYST",
    organizationId: "org",
    laboratoryId,
    laboratoryName: laboratoryId,
    profileCode: "PHARMA_QC",
    sessionMode: "database",
    permissions: ["inventory.view"],
  };
}

describe("sesión interna aislada para el puente Dilo", () => {
  it("expone la sesión sintetizada dentro del handler nativo", async () => {
    const actor = session("user-a", "lab-a");
    const resolved = await withServiceSession(actor, () => getSession());
    expect(resolved).toEqual(actor);
  });

  it("no mezcla actores entre operaciones concurrentes", async () => {
    const [a, b] = await Promise.all([
      withServiceSession(session("user-a", "lab-a"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getSession();
      }),
      withServiceSession(session("user-b", "lab-b"), () => getSession()),
    ]);
    expect(a?.userId).toBe("user-a");
    expect(a?.laboratoryId).toBe("lab-a");
    expect(b?.userId).toBe("user-b");
    expect(b?.laboratoryId).toBe("lab-b");
  });
});

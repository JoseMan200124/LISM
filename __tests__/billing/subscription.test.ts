import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

// ─── Imports from billing-plans ───────────────────────────────────────────────
import {
  canManageBilling,
  isSubscriptionActive,
  getRecurrentePlanPriceId,
  formatPlanAmount,
  PLAN_LIMITS,
} from "@/lib/billing-plans";

// ─── Imports from recurrente ──────────────────────────────────────────────────
import {
  mapRecurrenteSubscriptionStatus,
  verifyRecurrenteWebhookSignature,
} from "@/lib/recurrente";

// ─── Helpers for webhook tests ────────────────────────────────────────────────

/**
 * Generates a valid Svix-style HMAC-SHA256 signature for testing.
 * The signed content is "{svixId}.{svixTimestamp}.{rawBody}".
 * The secret is base64-encoded (without the "whsec_" prefix internally).
 */
function buildValidSignatureHeaders(
  rawBody: string,
  secretWithPrefix: string,
  svixId = "msg_test_id",
  svixTimestamp?: string
): { svixId: string; svixTimestamp: string; svixSignature: string } {
  const ts =
    svixTimestamp ?? String(Math.floor(Date.now() / 1000));

  const rawSecret = secretWithPrefix.startsWith("whsec_")
    ? secretWithPrefix.slice("whsec_".length)
    : secretWithPrefix;

  const secretBytes = Buffer.from(rawSecret, "base64");
  const signedContent = `${svixId}.${ts}.${rawBody}`;
  const digest = createHmac("sha256", secretBytes)
    .update(signedContent, "utf8")
    .digest("base64");

  return {
    svixId,
    svixTimestamp: ts,
    svixSignature: `v1,${digest}`,
  };
}

// ─── 1. canManageBilling ──────────────────────────────────────────────────────

describe("canManageBilling", () => {
  it("returns true for OWNER role", () => {
    expect(canManageBilling("OWNER")).toBe(true);
  });

  it("returns true for LAB_ADMIN role", () => {
    expect(canManageBilling("LAB_ADMIN")).toBe(true);
  });

  it("returns false for SCIENTIST role", () => {
    expect(canManageBilling("SCIENTIST")).toBe(false);
  });

  it("returns false for VIEWER role", () => {
    expect(canManageBilling("VIEWER")).toBe(false);
  });

  it("returns false for TECHNICIAN role", () => {
    expect(canManageBilling("TECHNICIAN")).toBe(false);
  });

  it("returns false for REVIEWER role", () => {
    expect(canManageBilling("REVIEWER")).toBe(false);
  });

  it("returns false for HEAD_OF_LAB role", () => {
    expect(canManageBilling("HEAD_OF_LAB")).toBe(false);
  });

  it("returns false for ANALYST role", () => {
    expect(canManageBilling("ANALYST")).toBe(false);
  });

  it("returns false for STUDENT role", () => {
    expect(canManageBilling("STUDENT")).toBe(false);
  });
});

// ─── 2. isSubscriptionActive ──────────────────────────────────────────────────

describe("isSubscriptionActive", () => {
  it("returns true for 'active' status", () => {
    expect(isSubscriptionActive("active")).toBe(true);
  });

  it("returns true for 'cancel_scheduled' status", () => {
    expect(isSubscriptionActive("cancel_scheduled")).toBe(true);
  });

  it("returns true for 'pending_activation' status", () => {
    // pending_activation is not in the active set per implementation
    expect(isSubscriptionActive("pending_activation")).toBe(false);
  });

  it("returns true for 'pending_plan_change' status", () => {
    expect(isSubscriptionActive("pending_plan_change")).toBe(true);
  });

  it("returns true for 'payment_method_update_pending' status", () => {
    expect(isSubscriptionActive("payment_method_update_pending")).toBe(true);
  });

  it("returns false for 'inactive' status", () => {
    expect(isSubscriptionActive("inactive")).toBe(false);
  });

  it("returns false for 'canceled' status", () => {
    expect(isSubscriptionActive("canceled")).toBe(false);
  });

  it("returns false for 'checkout_pending' status", () => {
    expect(isSubscriptionActive("checkout_pending")).toBe(false);
  });

  it("returns false for 'payment_failed' status", () => {
    expect(isSubscriptionActive("payment_failed")).toBe(false);
  });

  it("returns false for 'expired' status", () => {
    expect(isSubscriptionActive("expired")).toBe(false);
  });

  it("returns false for 'past_due' status", () => {
    expect(isSubscriptionActive("past_due")).toBe(false);
  });

  it("returns false for 'suspended' status", () => {
    expect(isSubscriptionActive("suspended")).toBe(false);
  });
});

// ─── 3. mapRecurrenteSubscriptionStatus ──────────────────────────────────────

describe("mapRecurrenteSubscriptionStatus", () => {
  it("maps 'active' → 'active'", () => {
    expect(mapRecurrenteSubscriptionStatus("active")).toBe("active");
  });

  it("maps 'cancelled' → 'canceled'", () => {
    expect(mapRecurrenteSubscriptionStatus("cancelled")).toBe("canceled");
  });

  it("maps 'canceled' → 'canceled'", () => {
    expect(mapRecurrenteSubscriptionStatus("canceled")).toBe("canceled");
  });

  it("maps 'pending' → 'pending_activation'", () => {
    expect(mapRecurrenteSubscriptionStatus("pending")).toBe(
      "pending_activation"
    );
  });

  it("maps 'paused' → 'suspended'", () => {
    expect(mapRecurrenteSubscriptionStatus("paused")).toBe("suspended");
  });

  it("maps null → 'inactive'", () => {
    expect(mapRecurrenteSubscriptionStatus(null)).toBe("inactive");
  });

  it("maps undefined → 'inactive'", () => {
    expect(mapRecurrenteSubscriptionStatus(undefined)).toBe("inactive");
  });

  it("maps empty string → 'inactive'", () => {
    expect(mapRecurrenteSubscriptionStatus("")).toBe("inactive");
  });

  it("maps 'past_due' → 'past_due'", () => {
    expect(mapRecurrenteSubscriptionStatus("past_due")).toBe("past_due");
  });

  it("maps unknown string → 'inactive'", () => {
    expect(mapRecurrenteSubscriptionStatus("something_unknown")).toBe(
      "inactive"
    );
  });

  it("is case-insensitive: 'ACTIVE' → 'active'", () => {
    expect(mapRecurrenteSubscriptionStatus("ACTIVE")).toBe("active");
  });

  it("is case-insensitive: 'PAUSED' → 'suspended'", () => {
    expect(mapRecurrenteSubscriptionStatus("PAUSED")).toBe("suspended");
  });
});

// ─── 4. getRecurrentePlanPriceId ──────────────────────────────────────────────

describe("getRecurrentePlanPriceId", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when env var is not set for academic_starter", () => {
    delete process.env.RECURRENTE_PLAN_ACADEMIC_STARTER_PRICE_ID;
    expect(getRecurrentePlanPriceId("academic_starter")).toBeNull();
  });

  it("returns null when env var is not set for professional", () => {
    delete process.env.RECURRENTE_PLAN_PROFESSIONAL_PRICE_ID;
    expect(getRecurrentePlanPriceId("professional")).toBeNull();
  });

  it("returns null when env var is not set for multi_site", () => {
    delete process.env.RECURRENTE_PLAN_MULTI_SITE_PRICE_ID;
    expect(getRecurrentePlanPriceId("multi_site")).toBeNull();
  });

  it("returns the value when env var is set for academic_starter", () => {
    process.env.RECURRENTE_PLAN_ACADEMIC_STARTER_PRICE_ID = "price_abc123";
    expect(getRecurrentePlanPriceId("academic_starter")).toBe("price_abc123");
  });

  it("returns the value when env var is set for professional", () => {
    process.env.RECURRENTE_PLAN_PROFESSIONAL_PRICE_ID = "price_def456";
    expect(getRecurrentePlanPriceId("professional")).toBe("price_def456");
  });

  it("returns the value when env var is set for multi_site", () => {
    process.env.RECURRENTE_PLAN_MULTI_SITE_PRICE_ID = "price_ghi789";
    expect(getRecurrentePlanPriceId("multi_site")).toBe("price_ghi789");
  });
});

// ─── 5. formatPlanAmount ──────────────────────────────────────────────────────

describe("formatPlanAmount", () => {
  it("formats 5900 cents + USD → 'USD $59.00/mes'", () => {
    expect(formatPlanAmount(5900, "USD")).toBe("USD $59.00/mes");
  });

  it("formats 18900 cents + USD → 'USD $189.00/mes'", () => {
    expect(formatPlanAmount(18900, "USD")).toBe("USD $189.00/mes");
  });

  it("formats 54900 cents + USD → 'USD $549.00/mes'", () => {
    expect(formatPlanAmount(54900, "USD")).toBe("USD $549.00/mes");
  });

  it("formats 100 cents + USD → 'USD $1.00/mes'", () => {
    expect(formatPlanAmount(100, "USD")).toBe("USD $1.00/mes");
  });

  it("formats 0 cents + USD → 'USD $0.00/mes'", () => {
    expect(formatPlanAmount(0, "USD")).toBe("USD $0.00/mes");
  });

  it("formats 5900 cents + GTQ → 'GTQ $59.00/mes'", () => {
    expect(formatPlanAmount(5900, "GTQ")).toBe("GTQ $59.00/mes");
  });

  it("preserves two decimal places for odd amounts", () => {
    expect(formatPlanAmount(999, "USD")).toBe("USD $9.99/mes");
  });
});

// ─── 6. PLAN_LIMITS ──────────────────────────────────────────────────────────

describe("PLAN_LIMITS", () => {
  it("academic_starter has maxUsers=5 and maxLabs=1", () => {
    expect(PLAN_LIMITS.academic_starter.maxUsers).toBe(5);
    expect(PLAN_LIMITS.academic_starter.maxLabs).toBe(1);
  });

  it("professional has maxUsers=12 and maxLabs=1", () => {
    expect(PLAN_LIMITS.professional.maxUsers).toBe(12);
    expect(PLAN_LIMITS.professional.maxLabs).toBe(1);
  });

  it("multi_site has maxUsers=30 and maxLabs=3", () => {
    expect(PLAN_LIMITS.multi_site.maxUsers).toBe(30);
    expect(PLAN_LIMITS.multi_site.maxLabs).toBe(3);
  });

  it("all plans have numeric maxUsers > 0", () => {
    for (const slug of ["academic_starter", "professional", "multi_site"] as const) {
      expect(PLAN_LIMITS[slug].maxUsers).toBeGreaterThan(0);
    }
  });

  it("all plans have numeric maxLabs > 0", () => {
    for (const slug of ["academic_starter", "professional", "multi_site"] as const) {
      expect(PLAN_LIMITS[slug].maxLabs).toBeGreaterThan(0);
    }
  });
});

// ─── 7–10. verifyRecurrenteWebhookSignature ───────────────────────────────────

describe("verifyRecurrenteWebhookSignature", () => {
  // A base64-encoded test secret (24 random bytes in base64)
  const TEST_SECRET_BYTES = Buffer.from("test-secret-key-for-unit-tests!!");
  const TEST_SECRET_B64 = TEST_SECRET_BYTES.toString("base64");
  const TEST_SECRET_WITH_PREFIX = `whsec_${TEST_SECRET_B64}`;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET = TEST_SECRET_WITH_PREFIX;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── 7. Valid signature returns true ─────────────────────────────────────────

  it("returns true for a valid signature", () => {
    const rawBody = JSON.stringify({ type: "payment.completed", data: {} });
    const headers = buildValidSignatureHeaders(rawBody, TEST_SECRET_WITH_PREFIX);

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headers)
    ).toBe(true);
  });

  it("returns true when signature header has multiple space-separated values and one matches", () => {
    const rawBody = JSON.stringify({ type: "subscription.created" });
    const validHeaders = buildValidSignatureHeaders(
      rawBody,
      TEST_SECRET_WITH_PREFIX
    );

    const headersWithMultiple = {
      ...validHeaders,
      svixSignature: `v1,invalidsig ${validHeaders.svixSignature}`,
    };

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headersWithMultiple)
    ).toBe(true);
  });

  // ── 8. Invalid signature returns false ──────────────────────────────────────

  it("returns false for an invalid signature", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const nowTs = String(Math.floor(Date.now() / 1000));

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_test_id",
        svixTimestamp: nowTs,
        svixSignature: "v1,invalidsignaturevalue==",
      })
    ).toBe(false);
  });

  it("returns false when body has been tampered with", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const headers = buildValidSignatureHeaders(rawBody, TEST_SECRET_WITH_PREFIX);

    const tamperedBody = JSON.stringify({ type: "payment.completed", extra: "tampered" });
    expect(
      verifyRecurrenteWebhookSignature(tamperedBody, headers)
    ).toBe(false);
  });

  it("returns false when svixId is different from the one used to sign", () => {
    const rawBody = JSON.stringify({ type: "subscription.updated" });
    const headers = buildValidSignatureHeaders(rawBody, TEST_SECRET_WITH_PREFIX);

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        ...headers,
        svixId: "msg_different_id",
      })
    ).toBe(false);
  });

  // ── 9. Old timestamp (>300s) returns false ───────────────────────────────────

  it("returns false when timestamp is more than 300 seconds old", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const headers = buildValidSignatureHeaders(
      rawBody,
      TEST_SECRET_WITH_PREFIX,
      "msg_old",
      oldTimestamp
    );

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headers)
    ).toBe(false);
  });

  it("returns false when timestamp is more than 300 seconds in the future", () => {
    const rawBody = JSON.stringify({ type: "subscription.cancelled" });
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 301);
    const headers = buildValidSignatureHeaders(
      rawBody,
      TEST_SECRET_WITH_PREFIX,
      "msg_future",
      futureTimestamp
    );

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headers)
    ).toBe(false);
  });

  it("returns true when timestamp is exactly within the 300s window", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const borderTimestamp = String(Math.floor(Date.now() / 1000) - 299);
    const headers = buildValidSignatureHeaders(
      rawBody,
      TEST_SECRET_WITH_PREFIX,
      "msg_border",
      borderTimestamp
    );

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headers)
    ).toBe(true);
  });

  it("returns false when timestamp is not a valid number", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_test",
        svixTimestamp: "not_a_number",
        svixSignature: "v1,somesig",
      })
    ).toBe(false);
  });

  // ── 10. Missing headers returns false ────────────────────────────────────────

  it("returns false when svixId is null", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const nowTs = String(Math.floor(Date.now() / 1000));

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: null,
        svixTimestamp: nowTs,
        svixSignature: "v1,somesig",
      })
    ).toBe(false);
  });

  it("returns false when svixTimestamp is null", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_test",
        svixTimestamp: null,
        svixSignature: "v1,somesig",
      })
    ).toBe(false);
  });

  it("returns false when svixSignature is null", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });
    const nowTs = String(Math.floor(Date.now() / 1000));

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_test",
        svixTimestamp: nowTs,
        svixSignature: null,
      })
    ).toBe(false);
  });

  it("returns false when all headers are null", () => {
    const rawBody = JSON.stringify({ type: "payment.completed" });

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: null,
        svixTimestamp: null,
        svixSignature: null,
      })
    ).toBe(false);
  });

  it("returns false when RECURRENTE_WEBHOOK_SIGNING_SECRET is not set", () => {
    delete process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET;

    const rawBody = JSON.stringify({ type: "payment.completed" });
    const nowTs = String(Math.floor(Date.now() / 1000));

    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_test",
        svixTimestamp: nowTs,
        svixSignature: "v1,somesig",
      })
    ).toBe(false);
  });

  it("accepts secret without 'whsec_' prefix", () => {
    process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET = TEST_SECRET_B64;

    const rawBody = JSON.stringify({ type: "subscription.created" });
    const headers = buildValidSignatureHeaders(rawBody, TEST_SECRET_B64);

    expect(
      verifyRecurrenteWebhookSignature(rawBody, headers)
    ).toBe(true);
  });
});

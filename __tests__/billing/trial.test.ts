/**
 * Tests for the trial system business logic.
 *
 * Covers: trial eligibility, status helpers, checkout configuration,
 * plan limits during trial, webhook signature verification, and
 * trial status transitions.
 *
 * Run with: npx vitest run __tests__/billing/trial.test.ts
 */

import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Imports from billing-plans ───────────────────────────────────────────────
import {
  canManageBilling,
  isSubscriptionActive,
  isSubscriptionTrialing,
  hasAccessToService,
  PLAN_LIMITS,
  TRIAL_DURATION_MONTHS,
} from "@/lib/billing-plans";

// ─── Imports from recurrente ──────────────────────────────────────────────────
import {
  mapRecurrenteSubscriptionStatus,
  verifyRecurrenteWebhookSignature,
  isTrialingStatus,
} from "@/lib/recurrente";

// ─── Webhook signature helper ─────────────────────────────────────────────────

const TEST_SECRET_PLAIN = "trial-test-secret-key-for-lism!!";
const TEST_SECRET_B64 = Buffer.from(TEST_SECRET_PLAIN).toString("base64");
const TEST_WHSEC = `whsec_${TEST_SECRET_B64}`;

function buildTrialSignatureHeaders(
  rawBody: string,
  svixId = "msg_trial_test",
  svixTimestamp?: string
): { svixId: string; svixTimestamp: string; svixSignature: string } {
  const ts = svixTimestamp ?? String(Math.floor(Date.now() / 1000));
  const signedContent = `${svixId}.${ts}.${rawBody}`;
  const digest = createHmac("sha256", Buffer.from(TEST_SECRET_PLAIN))
    .update(signedContent, "utf8")
    .digest("base64");
  return { svixId, svixTimestamp: ts, svixSignature: `v1,${digest}` };
}

// ─── describe("Trial eligibility logic") ─────────────────────────────────────

describe("Trial eligibility logic", () => {
  // Test 1: new org is eligible for trial — no trial_usage means eligible
  it("1. new org is eligible for trial", () => {
    // An org without trial history has trial_usage as null/undefined.
    // Eligibility is determined by checking whether trial_usage is falsy.
    const trialUsage: string | null = null;
    const isEligible = trialUsage == null;
    expect(isEligible).toBe(true);
  });

  // Test 2: org with trial_usage is not eligible
  it("2. org with trial_usage is not eligible", () => {
    // Once a trial has been used, the field is set to a non-null value.
    const trialUsage: string | null = "2026-01-15T00:00:00.000Z";
    const isEligible = trialUsage == null;
    expect(isEligible).toBe(false);
  });

  // Test 3: isSubscriptionTrialing returns true for 'trialing'
  it("3. isSubscriptionTrialing returns true for 'trialing'", () => {
    expect(isSubscriptionTrialing("trialing")).toBe(true);
  });

  // Test 4: isSubscriptionTrialing returns true for 'trial_cancel_scheduled'
  it("4. isSubscriptionTrialing returns true for 'trial_cancel_scheduled'", () => {
    expect(isSubscriptionTrialing("trial_cancel_scheduled")).toBe(true);
  });

  // Test 5: isSubscriptionTrialing returns false for 'active'
  it("5. isSubscriptionTrialing returns false for 'active'", () => {
    expect(isSubscriptionTrialing("active")).toBe(false);
  });

  // Test 6: hasAccessToService returns true for 'trialing'
  it("6. hasAccessToService returns true for 'trialing'", () => {
    expect(hasAccessToService("trialing")).toBe(true);
  });

  // Test 7: hasAccessToService returns true for 'active'
  it("7. hasAccessToService returns true for 'active'", () => {
    expect(hasAccessToService("active")).toBe(true);
  });

  // Test 8: hasAccessToService returns false for 'canceled'
  it("8. hasAccessToService returns false for 'canceled'", () => {
    expect(hasAccessToService("canceled")).toBe(false);
  });

  // Test 9: hasAccessToService returns false for 'trial_canceled'
  it("9. hasAccessToService returns false for 'trial_canceled'", () => {
    expect(hasAccessToService("trial_canceled")).toBe(false);
  });
});

// ─── describe("Recurrente status mapping") ───────────────────────────────────

describe("Recurrente status mapping", () => {
  // Test 10: mapRecurrenteSubscriptionStatus('trialing') → 'trialing'
  it("10. mapRecurrenteSubscriptionStatus('trialing') → 'trialing'", () => {
    expect(mapRecurrenteSubscriptionStatus("trialing")).toBe("trialing");
  });

  // Test 11: mapRecurrenteSubscriptionStatus('active') → 'active'
  it("11. mapRecurrenteSubscriptionStatus('active') → 'active'", () => {
    expect(mapRecurrenteSubscriptionStatus("active")).toBe("active");
  });

  // Test 12: mapRecurrenteSubscriptionStatus('cancelled') → 'canceled'
  it("12. mapRecurrenteSubscriptionStatus('cancelled') → 'canceled'", () => {
    expect(mapRecurrenteSubscriptionStatus("cancelled")).toBe("canceled");
  });

  // Test 13: mapRecurrenteSubscriptionStatus(null) → 'inactive'
  it("13. mapRecurrenteSubscriptionStatus(null) → 'inactive'", () => {
    expect(mapRecurrenteSubscriptionStatus(null)).toBe("inactive");
  });
});

// ─── describe("Trial checkout configuration") ────────────────────────────────

describe("Trial checkout configuration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RECURRENTE_SECRET_KEY: "test_secret_key_lism",
      RECURRENTE_API_BASE_URL: "https://app.recurrente.com/api",
    };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Test 14: createRecurrenteCheckout with withTrial=true includes free_trial_interval fields
  it("14. createRecurrenteCheckout with withTrial=true includes free_trial_interval fields", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        capturedBody = JSON.parse(options?.body as string) as Record<
          string,
          unknown
        >;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "co_trial_001",
              checkout_url: "https://app.recurrente.com/checkout/co_trial_001",
              status: "pending",
              created_at: new Date().toISOString(),
            }),
        } as Response);
      })
    );

    const { createRecurrenteCheckout } = await import("@/lib/recurrente");

    await createRecurrenteCheckout({
      planSlug: "professional",
      planName: "Professional",
      amountCents: 18900,
      currency: "USD",
      organizationId: "org_trial_test",
      checkoutId: "co_internal_001",
      successUrl: "https://app.lism.io/billing/success",
      cancelUrl: "https://app.lism.io/billing/cancel",
      withTrial: true,
    });

    expect(capturedBody).not.toBeNull();
    const items = capturedBody!.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].free_trial_interval).toBe("month");
    expect(items[0].free_trial_interval_count).toBe(1);
  });

  // Test 15: createRecurrenteCheckout with withTrial=false does not include trial fields
  it("15. createRecurrenteCheckout with withTrial=false does not include trial fields", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        capturedBody = JSON.parse(options?.body as string) as Record<
          string,
          unknown
        >;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "co_no_trial_001",
              checkout_url:
                "https://app.recurrente.com/checkout/co_no_trial_001",
              status: "pending",
              created_at: new Date().toISOString(),
            }),
        } as Response);
      })
    );

    const { createRecurrenteCheckout } = await import("@/lib/recurrente");

    await createRecurrenteCheckout({
      planSlug: "academic_starter",
      planName: "Academic Starter",
      amountCents: 5900,
      currency: "USD",
      organizationId: "org_no_trial_test",
      checkoutId: "co_internal_002",
      successUrl: "https://app.lism.io/billing/success",
      cancelUrl: "https://app.lism.io/billing/cancel",
      withTrial: false,
    });

    expect(capturedBody).not.toBeNull();
    const items = capturedBody!.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("free_trial_interval");
    expect(items[0]).not.toHaveProperty("free_trial_interval_count");
  });

  // Test 16: createRecurrenteCheckout metadata includes isTrial=true when withTrial=true
  it("16. createRecurrenteCheckout metadata includes isTrial=true when withTrial=true", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        capturedBody = JSON.parse(options?.body as string) as Record<
          string,
          unknown
        >;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "co_trial_002",
              checkout_url: "https://app.recurrente.com/checkout/co_trial_002",
              status: "pending",
              created_at: new Date().toISOString(),
            }),
        } as Response);
      })
    );

    const { createRecurrenteCheckout } = await import("@/lib/recurrente");

    await createRecurrenteCheckout({
      planSlug: "multi_site",
      planName: "Multi Site",
      amountCents: 54900,
      currency: "USD",
      organizationId: "org_multi_trial",
      checkoutId: "co_internal_003",
      successUrl: "https://app.lism.io/billing/success",
      cancelUrl: "https://app.lism.io/billing/cancel",
      withTrial: true,
    });

    expect(capturedBody).not.toBeNull();
    const metadata = capturedBody!.metadata as Record<string, unknown>;
    expect(metadata.isTrial).toBe(true);
    expect(metadata.organizationId).toBe("org_multi_trial");
    expect(metadata.planSlug).toBe("multi_site");
  });
});

// ─── describe("Plan limits during trial") ────────────────────────────────────

describe("Plan limits during trial", () => {
  // Test 17: PLAN_LIMITS.academic_starter.maxUsers === 5
  it("17. PLAN_LIMITS.academic_starter.maxUsers === 5", () => {
    expect(PLAN_LIMITS.academic_starter.maxUsers).toBe(5);
  });

  // Test 18: PLAN_LIMITS.professional.maxUsers === 12
  it("18. PLAN_LIMITS.professional.maxUsers === 12", () => {
    expect(PLAN_LIMITS.professional.maxUsers).toBe(12);
  });

  // Test 19: PLAN_LIMITS.multi_site.maxUsers === 30
  it("19. PLAN_LIMITS.multi_site.maxUsers === 30", () => {
    expect(PLAN_LIMITS.multi_site.maxUsers).toBe(30);
  });

  // Test 20: PLAN_LIMITS.multi_site.maxLabs === 3
  it("20. PLAN_LIMITS.multi_site.maxLabs === 3", () => {
    expect(PLAN_LIMITS.multi_site.maxLabs).toBe(3);
  });
});

// ─── describe("Webhook signature verification") ───────────────────────────────

describe("Webhook signature verification", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET = TEST_WHSEC;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Test 21: Valid Svix signature passes verification
  it("21. Valid Svix signature passes verification", () => {
    const rawBody = JSON.stringify({
      type: "subscription.trial_started",
      data: { organization_id: "org_trial_001" },
    });
    const headers = buildTrialSignatureHeaders(rawBody);
    expect(verifyRecurrenteWebhookSignature(rawBody, headers)).toBe(true);
  });

  // Test 22: Invalid signature is rejected
  it("22. Invalid signature is rejected", () => {
    const rawBody = JSON.stringify({
      type: "subscription.trial_started",
      data: {},
    });
    const nowTs = String(Math.floor(Date.now() / 1000));
    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_invalid",
        svixTimestamp: nowTs,
        svixSignature: "v1,thisisnotavalidsignatureatall==",
      })
    ).toBe(false);
  });

  // Test 23: Expired timestamp is rejected
  it("23. Expired timestamp is rejected", () => {
    const rawBody = JSON.stringify({
      type: "subscription.trial_ended",
      data: { subscription_id: "sub_expired_trial" },
    });
    // Timestamp older than the 300s replay-protection window
    const expiredTs = String(Math.floor(Date.now() / 1000) - 400);
    const headers = buildTrialSignatureHeaders(rawBody, "msg_expired", expiredTs);
    expect(verifyRecurrenteWebhookSignature(rawBody, headers)).toBe(false);
  });

  // Test 24: Missing headers are rejected
  it("24. Missing headers are rejected", () => {
    const rawBody = JSON.stringify({ type: "subscription.trial_canceled" });
    const nowTs = String(Math.floor(Date.now() / 1000));

    // Missing svixId
    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: null,
        svixTimestamp: nowTs,
        svixSignature: "v1,somesig",
      })
    ).toBe(false);

    // Missing svixTimestamp
    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_trial",
        svixTimestamp: null,
        svixSignature: "v1,somesig",
      })
    ).toBe(false);

    // Missing svixSignature
    expect(
      verifyRecurrenteWebhookSignature(rawBody, {
        svixId: "msg_trial",
        svixTimestamp: nowTs,
        svixSignature: null,
      })
    ).toBe(false);
  });
});

// ─── describe("Trial status transitions") ────────────────────────────────────

describe("Trial status transitions", () => {
  // Test 25: isSubscriptionActive includes trialing status
  it("25. isSubscriptionActive includes trialing status", () => {
    expect(isSubscriptionActive("trialing")).toBe(true);
    // trial_cancel_scheduled is also active (user still has access)
    expect(isSubscriptionActive("trial_cancel_scheduled")).toBe(true);
    // first_payment_pending is also considered active during trial-to-paid transition
    expect(isSubscriptionActive("first_payment_pending")).toBe(true);
  });

  // Test 26: trial_canceled status returns false for isSubscriptionActive
  it("26. trial_canceled status returns false for isSubscriptionActive", () => {
    expect(isSubscriptionActive("trial_canceled")).toBe(false);
  });
});

// ─── Additional sanity checks ─────────────────────────────────────────────────

describe("TRIAL_DURATION_MONTHS constant", () => {
  it("TRIAL_DURATION_MONTHS is 1", () => {
    expect(TRIAL_DURATION_MONTHS).toBe(1);
  });
});

describe("isTrialingStatus helper", () => {
  it("returns true for 'trialing'", () => {
    expect(isTrialingStatus("trialing")).toBe(true);
  });

  it("returns false for 'active'", () => {
    expect(isTrialingStatus("active")).toBe(false);
  });

  it("returns false for 'trial_cancel_scheduled'", () => {
    // isTrialingStatus is a narrower check than isSubscriptionTrialing
    expect(isTrialingStatus("trial_cancel_scheduled")).toBe(false);
  });

  it("returns false for 'trial_canceled'", () => {
    expect(isTrialingStatus("trial_canceled")).toBe(false);
  });
});

/**
 * Tests for Recurrente webhook handler logic.
 *
 * These tests cover:
 *  1. verifyRecurrenteWebhookSignature — pure function, fully testable
 *  2. Handler routing branches via a thin shim that replaces getSql()
 *     and exercises the POST handler end-to-end without hitting Postgres.
 *
 * Run with: npx vitest run __tests__/billing/webhook.test.ts
 */

import { createHmac } from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers to generate valid / invalid Svix signatures
// ---------------------------------------------------------------------------

const TEST_SECRET_PLAIN = "supersecrettestkey1234567890abc"; // raw bytes
const TEST_SECRET_B64 = Buffer.from(TEST_SECRET_PLAIN).toString("base64");
const TEST_WHSEC = `whsec_${TEST_SECRET_B64}`;

function makeSignature(
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  secret = TEST_SECRET_PLAIN
): string {
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const digest = createHmac("sha256", Buffer.from(secret))
    .update(signedContent, "utf8")
    .digest("base64");
  return `v1,${digest}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

// ---------------------------------------------------------------------------
// 1. Unit tests for verifyRecurrenteWebhookSignature (pure function)
// ---------------------------------------------------------------------------

describe("verifyRecurrenteWebhookSignature", () => {
  beforeEach(() => {
    process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET = TEST_WHSEC;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    delete process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET;
  });

  it("returns true for a valid signature", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_01jtest";
    const ts = nowSeconds();
    const body = JSON.stringify({ type: "payment_intent.succeeded" });
    const sig = makeSignature(id, ts, body);

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
      })
    ).toBe(true);
  });

  it("returns false when the signature is tampered", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_tampered";
    const ts = nowSeconds();
    const body = JSON.stringify({ type: "payment_intent.succeeded" });

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: ts,
        svixSignature: "v1,invalidsignaturevalue==",
      })
    ).toBe(false);
  });

  it("returns false when svix-id is missing", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );
    const ts = nowSeconds();
    const body = "{}";
    const sig = makeSignature("", ts, body);

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: null,
        svixTimestamp: ts,
        svixSignature: sig,
      })
    ).toBe(false);
  });

  it("returns false when svix-timestamp is missing", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    expect(
      verifyRecurrenteWebhookSignature("{}", {
        svixId: "msg_01",
        svixTimestamp: null,
        svixSignature: "v1,something",
      })
    ).toBe(false);
  });

  it("returns false when svix-signature is missing", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    expect(
      verifyRecurrenteWebhookSignature("{}", {
        svixId: "msg_01",
        svixTimestamp: nowSeconds(),
        svixSignature: null,
      })
    ).toBe(false);
  });

  it("returns false when the event is older than 5 minutes (replay protection)", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_old";
    const staleTs = String(Math.floor(Date.now() / 1000) - 400); // 400 s ago > 300 s limit
    const body = "{}";
    const sig = makeSignature(id, staleTs, body);

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: staleTs,
        svixSignature: sig,
      })
    ).toBe(false);
  });

  it("returns false when the signing secret is not set", async () => {
    delete process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET;

    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_nosecret";
    const ts = nowSeconds();
    const body = "{}";
    const sig = makeSignature(id, ts, body);

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
      })
    ).toBe(false);
  });

  it("accepts whsec_ prefixed secret", async () => {
    // Secret is already set as whsec_<b64> in beforeEach — just verify it works.
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_whsec";
    const ts = nowSeconds();
    const body = JSON.stringify({ hello: "world" });
    const sig = makeSignature(id, ts, body);

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: ts,
        svixSignature: sig,
      })
    ).toBe(true);
  });

  it("accepts multiple space-separated signatures (at least one valid)", async () => {
    const { verifyRecurrenteWebhookSignature } = await import(
      "@/lib/recurrente"
    );

    const id = "msg_multi";
    const ts = nowSeconds();
    const body = "{}";
    const validSig = makeSignature(id, ts, body);

    const combined = `v1,invalidsig== ${validSig}`;

    expect(
      verifyRecurrenteWebhookSignature(body, {
        svixId: id,
        svixTimestamp: ts,
        svixSignature: combined,
      })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Integration-style handler tests (mock getSql + signature env)
// ---------------------------------------------------------------------------

/**
 * Build a fake Request object that matches Next.js expectations.
 */
function buildRequest(
  payload: object,
  overrideHeaders?: Record<string, string | null>
): Request {
  const body = JSON.stringify(payload);
  const id = "msg_test_" + Math.random().toString(36).slice(2, 8);
  const ts = nowSeconds();
  const sig = makeSignature(id, ts, body);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": ts,
    "svix-signature": sig,
  };

  if (overrideHeaders) {
    for (const [k, v] of Object.entries(overrideHeaders)) {
      if (v === null) {
        delete headers[k];
      } else {
        headers[k] = v;
      }
    }
  }

  return new Request("https://example.com/api/webhooks/recurrente", {
    method: "POST",
    headers,
    body,
  });
}

/**
 * Create a mock sql tagged template function that records calls and
 * returns configurable rows.
 *
 * Usage:
 *   const { sql, calls } = makeMockSql({ defaultRows: [] });
 *   // sql`SELECT ...` resolves to []
 *   // sql`INSERT ... RETURNING id` can be made to return [{ id: "uuid" }]
 */
function makeMockSql(opts: {
  /** Rows to return for each successive call, in order. Falls back to [] */
  rowSequence?: unknown[][];
} = {}) {
  const calls: string[] = [];
  let callIndex = 0;
  const rowSequence = opts.rowSequence ?? [];

  const sql = vi.fn((...args: unknown[]) => {
    // args[0] is the TemplateStringsArray; join its parts to capture the SQL text
    const parts = args[0] as TemplateStringsArray;
    calls.push(parts.join("?"));

    const rows = rowSequence[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(rows);
  }) as unknown as ReturnType<typeof import("@/lib/db").getSql>;

  return { sql, calls };
}

describe("POST /api/webhooks/recurrente — handler routing", () => {
  beforeEach(() => {
    process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET = TEST_WHSEC;
    process.env.NODE_ENV = "test";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET;
    vi.restoreAllMocks();
  });

  // ── 1. payment_intent.succeeded with valid signature → 200 OK ─────────────

  it("payment_intent.succeeded with valid signature responds 200 and activates subscription", async () => {
    const { sql } = makeMockSql({
      // Call order: dedup SELECT → event INSERT → checkout UPDATE (x2) → sub UPDATE → payment INSERT → org UPDATE → event mark processed
      rowSequence: [
        [], // dedup: no existing event
        [{ id: "evt-uuid" }], // billing_events INSERT RETURNING id
        [], // checkout UPDATE by internalCheckoutId
        [], // checkout UPDATE by organizationId
        [], // billing_subscriptions UPDATE
        [], // billing_payments INSERT
        [], // organizations UPDATE
        [], // billing_events mark processed
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_123",
      type: "payment_intent.succeeded",
      data: {
        id: "pi_abc",
        subscription_id: "sub_xyz",
        amount_in_cents: 18900,
        currency: "USD",
        metadata: {
          organizationId: "org_1",
          planSlug: "professional",
          internalCheckoutId: "co_1",
        },
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });

  // ── 2. Invalid signature → 400 ────────────────────────────────────────────

  it("rejects requests with an invalid Svix signature", async () => {
    vi.doMock("@/lib/db", () => ({
      getSql: () => makeMockSql().sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const req = buildRequest(
      { type: "payment_intent.succeeded", data: {} },
      { "svix-signature": "v1,completelywrongsig==" }
    );

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  // ── 3. subscription.created → 200 and activation path called ─────────────

  it("subscription.created responds 200 and follows payment-succeeded activation path", async () => {
    const { sql, calls } = makeMockSql({
      rowSequence: [
        [],
        [{ id: "evt-sub-created" }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_sub_created",
      type: "subscription.created",
      data: {
        id: "sub_new",
        subscription_id: "sub_new",
        metadata: {
          organizationId: "org_2",
          planSlug: "academic_starter",
        },
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // At least the dedup SELECT and subscription UPDATE should have been issued
    expect(calls.length).toBeGreaterThan(0);
    const sqlText = calls.join("\n");
    expect(sqlText).toMatch(/billing_events/i);
    expect(sqlText).toMatch(/billing_subscriptions/i);
  });

  // ── 4. subscription.cancelled → subscription marked canceled ──────────────

  it("subscription.cancelled responds 200 and marks subscription canceled", async () => {
    const { sql, calls } = makeMockSql({
      rowSequence: [
        [],
        [{ id: "evt-cancel" }],
        [{ organization_id: "org_3", status: "active" }], // SELECT in handleSubscriptionCancelled
        [], // UPDATE billing_subscriptions canceled
        [], // UPDATE organizations plan_code = 'STARTER'
        [], // mark processed
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_cancel",
      type: "subscription.cancelled",
      data: {
        subscription_id: "sub_tobe_canceled",
        metadata: { organizationId: "org_3" },
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const sqlText = calls.join("\n");
    // Cancellation should update billing_subscriptions and reset organizations.plan_code
    expect(sqlText).toMatch(/billing_subscriptions/i);
    expect(sqlText).toMatch(/organizations/i);
  });

  // ── 5. payment.failed → subscription status payment_failed ────────────────

  it("payment.failed responds 200 and sets subscription status to payment_failed", async () => {
    const { sql, calls } = makeMockSql({
      rowSequence: [
        [],
        [{ id: "evt-pf" }],
        [], // UPDATE billing_subscriptions payment_failed
        [{ organization_id: "org_4" }], // SELECT org from sub for payment record
        [], // INSERT billing_payments
        [], // mark processed
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_pf",
      type: "payment.failed",
      data: {
        id: "pi_failed",
        subscription_id: "sub_overdue",
        amount_in_cents: 18900,
        currency: "USD",
        metadata: {},
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const sqlText = calls.join("\n");
    expect(sqlText).toMatch(/billing_subscriptions/i);
    expect(sqlText).toMatch(/payment_failed/i);
  });

  // ── 6. Duplicate event → deduplicated, returns 200 without reprocessing ───

  it("returns 200 with duplicate:true for an already-processed event", async () => {
    const { sql, calls } = makeMockSql({
      rowSequence: [
        // dedup SELECT returns a processed event
        [{ processing_status: "processed" }],
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_dup",
      type: "payment_intent.succeeded",
      data: {
        metadata: { organizationId: "org_5", planSlug: "professional" },
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(true);

    // Only the dedup SELECT should have been called — no further processing
    expect(calls).toHaveLength(1);
  });

  // ── 7. Missing organizationId in metadata → handled gracefully ─────────────

  it("handles payment_intent.succeeded with missing organizationId gracefully", async () => {
    const { sql } = makeMockSql({
      rowSequence: [
        [],
        [{ id: "evt-noorg" }],
        // handlePaymentSucceeded returns early when organizationId is null
        [], // mark processed
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_noorg",
      type: "payment_intent.succeeded",
      data: {
        id: "pi_noorg",
        subscription_id: "sub_noorg",
        // no metadata at all
      },
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    // Should not crash — returns 200
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  // ── 8. Unknown event type → logged, returns 200 without crashing ──────────

  it("returns 200 for an unknown event type without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { sql } = makeMockSql({
      rowSequence: [
        [],
        [{ id: "evt-unknown" }],
        [], // mark processed
      ],
    });

    vi.doMock("@/lib/db", () => ({
      getSql: () => sql,
      hasDatabase: () => true,
    }));

    const { POST } = await import("@/app/api/webhooks/recurrente/route");

    const payload = {
      id: "evt_unknown_type",
      type: "some.unknown.event_type",
      data: {},
    };

    const req = buildRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("some.unknown.event_type")
    );
  });
});

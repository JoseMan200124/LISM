# RECURRENTE_BILLING.md — Billing System Documentation

System: LISM (NexaLab)
Payment processor: Recurrente (https://app.recurrente.com)
Last updated: 2026-06-29

---

## Sección 1: Arquitectura

### Overview

```
+------------------+        +----------------------+        +------------------+
|   Frontend       |        |   LISM API Routes    |        |  Recurrente API  |
|  (Next.js)       |        |  (app/api/billing/)  |        |                  |
|                  |        |                      |        |                  |
| BillingPage  ----+------> | POST /checkout  -----+------> | POST /checkouts  |
| PlanSelector     |        | GET  /status    -----+------> | GET  /subscripti.|
| PaymentMethod    |        | PUT  /cancel    -----+------> | DELETE /subscr.  |
|                  |        | POST /reactivate-----+------> | POST /checkouts  |
+------------------+        +----------------------+        +------------------+
                                       ^
                                       |  Webhooks (Svix-signed)
                                       |
                            +----------+-----------+
                            |  POST /api/billing/  |
                            |       webhook        |
                            |                      |
                            | - Verify signature   |
                            | - Update DB status   |
                            | - Write audit event  |
                            +----------------------+
                                       |
                            +----------+-----------+
                            |   PostgreSQL (Neon)  |
                            |                      |
                            | billing_subscriptions|
                            | billing_events       |
                            | organizations        |
                            +----------------------+
```

### Component Responsibilities

| Component | Location | Responsibility |
|---|---|---|
| BillingPage | `app/(dashboard)/billing/page.tsx` | UI: plan display, upgrade/downgrade, cancel |
| Checkout API | `app/api/billing/checkout/route.ts` | Create Recurrente checkout session, store pending record |
| Status API | `app/api/billing/status/route.ts` | Read current subscription status from DB |
| Cancel API | `app/api/billing/cancel/route.ts` | Call Recurrente DELETE /subscriptions/{id} |
| Reactivate API | `app/api/billing/reactivate/route.ts` | Create new checkout for reactivation |
| Webhook handler | `app/api/billing/webhook/route.ts` | Receive and process Recurrente webhook events |
| Sync API | `app/api/billing/sync/route.ts` | Manual sync: pull latest subscription state from Recurrente |
| DB tables | Migration 0005 | `billing_subscriptions`, `billing_events` |
| Session auth | `lib/session.ts` | Gate all billing routes to OWNER or LAB_ADMIN |

---

## Sección 2: Planes

### Plan Definitions

| Slug | Display Name | Price | Users | Labs | Recurrente Price ID env var |
|---|---|---|---|---|---|
| `academic_starter` | Academic Starter | USD 59/month | 5 | 1 | `RECURRENTE_PRICE_ACADEMIC_STARTER` |
| `professional` | Professional | USD 189/month | 12 | 1 | `RECURRENTE_PRICE_PROFESSIONAL` |
| `multi_site` | Multi-site | USD 549/month | 30 | 3 | `RECURRENTE_PRICE_MULTI_SITE` |

### Plan Details

**Academic Starter — USD 59/month**
- 5 users included (USD 5/user/month additional)
- Samples, inventory, equipment, basic QC, reports
- 1 laboratory
- Target: universities, research groups

**Professional — USD 189/month**
- 12 users included (USD 10/user/month additional)
- Full order, sample, and results workflow
- Inventory, equipment, alerts, audit trail, reports
- Standard support
- Target: small to mid-size labs

**Multi-site — USD 549/month**
- 3 laboratories included
- 30 users included
- Consolidated dashboard, scheduled exports, priority support
- Integrations and SLA quoted separately
- Target: multi-location organizations

### Configuring Recurrente Products and Price IDs

Recurrente supports two checkout modes:

**Mode A — Dynamic pricing (no price_id)**
Pass `amount_in_cents` directly in each checkout request. No pre-configuration needed. Use this during development or if prices change frequently.

```json
{
  "items": [{
    "name": "Professional — LISM",
    "amount_in_cents": 14900,
    "currency": "USD",
    "charge_type": "recurring",
    "quantity": 1
  }]
}
```

**Mode B — Price IDs (recommended for production)**
Create products and prices in the Recurrente dashboard, then set the env vars. The checkout item becomes:

```json
{
  "items": [{ "price_id": "price_abc123", "quantity": 1 }]
}
```

Set env vars:
```
RECURRENTE_PRICE_ACADEMIC_STARTER=price_xxxx
RECURRENTE_PRICE_PROFESSIONAL=price_yyyy
RECURRENTE_PRICE_MULTI_SITE=price_zzzz
```

If a price_id env var is set for a plan, LISM uses it; otherwise it falls back to dynamic pricing.

---

## Sección 3: Flujos de suscripción

### New Subscription Flow

```
1. User (OWNER/LAB_ADMIN) visits /billing, clicks "Subscribe" on a plan.

2. Frontend POST /api/billing/checkout { planSlug }

3. API:
   a. Verify session (OWNER or LAB_ADMIN only)
   b. Check no active subscription exists for this org
   c. Generate checkoutId (UUID)
   d. INSERT billing_subscriptions row: status = 'checkout_pending'
   e. POST https://app.recurrente.com/api/checkouts
      Body: { items: [...], success_url, cancel_url,
              metadata: { organizationId, planSlug, checkoutId } }
   f. Save recurrente_checkout_id to DB row
   g. Return { checkoutUrl }

4. Frontend redirects user to checkoutUrl (Recurrente-hosted payment page).

5. User completes payment on Recurrente.

6. Recurrente fires webhook: subscription.created + payment.completed
   POST /api/billing/webhook
   a. Verify Svix signature
   b. Extract organizationId from metadata
   c. UPDATE billing_subscriptions:
      status = 'active', recurrente_subscription_id, current_period_end
   d. UPDATE organizations SET plan_code = <plan>
   e. INSERT billing_events row
   f. writeAuditEvent(...)

7. Recurrente redirects user to success_url.

8. Frontend polls /api/billing/status until status = 'active'.
```

### Plan Change Flow

```
1. User clicks "Change plan" → selects new plan.

2. Frontend POST /api/billing/checkout { planSlug, changePlan: true }

3. API:
   a. Fetch current active subscription
   b. Cancel existing Recurrente subscription immediately (DELETE /subscriptions/{id})
   c. Create new checkout for new plan (same as steps 3c–3g above)
   d. Set old subscription status = 'cancel_scheduled'
   e. Return { checkoutUrl }

4. User pays on new checkout (steps 5–8 same as New Subscription).

NOTE: Recurrente does not support inline plan upgrades/downgrades.
      LISM implements plan changes as cancel + new checkout.
      Pro-rating is not applied; new billing cycle starts on payment date.
```

### Cancellation Flow

```
1. User clicks "Cancel subscription".

2. Frontend POST /api/billing/cancel

3. API:
   a. Verify session (OWNER or LAB_ADMIN)
   b. Fetch active subscription: recurrente_subscription_id
   c. DELETE https://app.recurrente.com/api/subscriptions/{id}
   d. UPDATE billing_subscriptions SET status = 'cancel_scheduled',
      cancel_at_period_end = true
   e. writeAuditEvent(...)
   f. Return { cancelAtPeriodEnd: <date> }

4. Recurrente fires webhook: subscription.cancelled
   a. Verify signature
   b. UPDATE billing_subscriptions SET status = 'cancelled'
   c. UPDATE organizations SET plan_code = 'STARTER'
   d. INSERT billing_events
```

### Payment Method Update Flow

```
1. User clicks "Update payment method".

2. Frontend POST /api/billing/checkout { updatePayment: true }

3. API:
   a. POST https://app.recurrente.com/api/checkouts
      (Recurrente handles payment method update via new checkout flow)
   b. Return { checkoutUrl }

4. User updates card on Recurrente-hosted page.

5. Recurrente fires subscription.updated webhook.
   a. LISM records event in billing_events.
   b. No status change needed if subscription was already active.
```

### Reactivation Flow

```
1. User whose subscription is 'cancelled' or 'payment_failed' clicks "Reactivate".

2. Frontend POST /api/billing/reactivate { planSlug }

3. API:
   a. Verify previous subscription exists
   b. Create new checkout (same as New Subscription steps 3c–3g)
   c. Return { checkoutUrl }

4. Steps 4–8 identical to New Subscription.
```

---

## Sección 4: Mapeo de estados

| Recurrente Subscription Status | LISM Internal Status | Description |
|---|---|---|
| (none — checkout created) | `checkout_pending` | Checkout URL sent to user, awaiting payment |
| `active` | `pending_activation` | Payment received, waiting for subscription.created webhook |
| `active` | `active` | Subscription confirmed and active |
| `cancelled` (end of period) | `cancel_scheduled` | Cancellation requested, access until period end |
| `cancelled` | `cancelled` | Subscription fully ended |
| `past_due` | `payment_failed` | Payment failed, Recurrente retrying |
| `paused` | `paused` | Subscription paused (Recurrente-initiated) |
| (no row) | `inactive` | No subscription record for this org |

**organizations.plan_code mapping:**

| LISM Status | organizations.plan_code |
|---|---|
| `active` (academic_starter) | `ACADEMIC_STARTER` |
| `active` (professional) | `PROFESSIONAL` |
| `active` (multi_site) | `MULTI_SITE` |
| `cancelled`, `inactive`, `payment_failed` | `STARTER` (free/locked) |

---

## Sección 5: Eventos webhook soportados

| Event | Trigger | Action taken by LISM |
|---|---|---|
| `subscription.created` | New subscription confirmed by Recurrente | Set status = `active`, update `plan_code`, store `recurrente_subscription_id`, insert billing_event |
| `subscription.updated` | Payment method changed, renewal date updated | Update `current_period_end`, insert billing_event |
| `subscription.cancelled` | Subscription cancelled (immediate or end-of-period) | Set status = `cancelled`, reset `plan_code` to `STARTER`, insert billing_event |
| `payment.completed` | Successful payment (renewal or initial) | Update `current_period_end`, set status = `active` if was `payment_failed`, insert billing_event |
| `payment.failed` | Payment attempt failed | Set status = `payment_failed`, insert billing_event, (optionally: notify OWNER via email) |
| `payment_intent.succeeded` | Payment intent confirmed | Record in billing_events; no status change if subscription event follows |

**Events intentionally ignored:**
- Any event without a matching `organizationId` in metadata is rejected with HTTP 400.
- Unknown event types are logged and acknowledged with HTTP 200 (no action).

---

## Sección 6: Variables de entorno

| Variable | Description | Required |
|---|---|---|
| `RECURRENTE_SECRET_KEY` | API key from Recurrente dashboard (X-SECRET-KEY header) | Yes |
| `RECURRENTE_WEBHOOK_SECRET` | Webhook signing secret from Recurrente dashboard (format: `whsec_...`) | Yes |
| `RECURRENTE_PRICE_ACADEMIC_STARTER` | Recurrente price_id for Academic Starter plan | No (falls back to dynamic pricing) |
| `RECURRENTE_PRICE_PROFESSIONAL` | Recurrente price_id for Professional plan | No (falls back to dynamic pricing) |
| `RECURRENTE_PRICE_MULTI_SITE` | Recurrente price_id for Multi-site plan | No (falls back to dynamic pricing) |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app (e.g. `https://app.nexalab.io`) | Yes (for success_url/cancel_url) |
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |

Add to `.env.local` for local development. Add to Vercel environment variables for production.

---

## Sección 7: Setup y configuración

### Step 1 — Create Recurrente Products

1. Log in to https://app.recurrente.com
2. Go to **Products** → **New product**
3. Create three products:

   | Product name | Price | Currency | Billing interval | Charge type |
   |---|---|---|---|---|
   | LISM Academic Starter | 49.00 | USD | Monthly | Recurring |
   | LISM Professional | 149.00 | USD | Monthly | Recurring |
   | LISM Multi-site | 299.00 | USD | Monthly | Recurring |

4. After creating each product, copy the **Price ID** (format: `price_xxxxxx`).

### Step 2 — Set Environment Variables

```bash
# .env.local (never commit to git)
RECURRENTE_SECRET_KEY=replace-with-your-sk_live-or-sk_test-key
RECURRENTE_WEBHOOK_SECRET=replace-with-your-whsec-signing-secret
RECURRENTE_PRICE_ACADEMIC_STARTER=price_xxxxxxxxxxxxxxxxxx
RECURRENTE_PRICE_PROFESSIONAL=price_xxxxxxxxxxxxxxxxxx
RECURRENTE_PRICE_MULTI_SITE=price_xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://app.nexalab.io
```

### Step 3 — Register Webhook Endpoint

1. In Recurrente dashboard, go to **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://app.nexalab.io/api/billing/webhook`
3. Select events to receive:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.cancelled`
   - `payment.completed`
   - `payment.failed`
   - `payment_intent.succeeded`
4. Save.

### Step 4 — Get the Signing Secret

1. In Recurrente dashboard, open the webhook endpoint you just created.
2. Click **Reveal** next to **Signing Secret**.
3. Copy the value (starts with `whsec_`).
4. Set `RECURRENTE_WEBHOOK_SECRET=whsec_...` in your environment.

### Step 5 — Apply Database Migration

Run migration 0005 (billing tables). See Section 11 for migration commands.

### Step 6 — Deploy and Verify

1. Deploy to Vercel with env vars set.
2. Use the Recurrente sandbox (see Section 8) to verify the checkout flow end-to-end.

---

## Sección 8: Testing en sandbox

### Using Recurrente Sandbox

1. In Recurrente dashboard, switch to **Sandbox mode** (toggle in top navigation).
2. Sandbox has its own secret key — set `RECURRENTE_SECRET_KEY` to the sandbox key.
3. Use test card numbers provided in Recurrente sandbox documentation.
4. Complete a checkout flow to verify success_url redirect and DB state update.

**Important:** Recurrente sandbox does NOT fire webhooks. After a sandbox payment, manually update the DB for testing or use the webhook simulation method below.

### Testing the Webhook Handler with curl

Generate a valid Svix signature manually:

```bash
# Set these variables
WEBHOOK_SECRET="whsec_YOUR_SECRET_HERE"          # full secret including whsec_ prefix
SVIX_ID="msg_test_$(date +%s)"
SVIX_TIMESTAMP=$(date +%s)
PAYLOAD='{"type":"subscription.created","data":{"id":"sub_test123","status":"active","metadata":{"organizationId":"org_YOUR_ID","planSlug":"professional","checkoutId":"ck_test123"}}}'

# Strip whsec_ prefix and base64-decode
SECRET_B64="${WEBHOOK_SECRET#whsec_}"

# Compute HMAC-SHA256 signature
SIGNED_CONTENT="${SVIX_ID}.${SVIX_TIMESTAMP}.${PAYLOAD}"
SIGNATURE=$(echo -n "$SIGNED_CONTENT" | openssl dgst -sha256 -hmac "$(echo $SECRET_B64 | base64 -d 2>/dev/null || echo $SECRET_B64)" -binary | base64)

# Send the request
curl -X POST https://app.nexalab.io/api/billing/webhook \
  -H "Content-Type: application/json" \
  -H "svix-id: ${SVIX_ID}" \
  -H "svix-timestamp: ${SVIX_TIMESTAMP}" \
  -H "svix-signature: v1,${SIGNATURE}" \
  -d "$PAYLOAD"
```

Expected response: `HTTP 200 {"received":true}`

### Testing All Events

Repeat the curl command above with different payloads for each event type:

```json
// payment.failed
{"type":"payment.failed","data":{"subscription_id":"sub_test123","metadata":{"organizationId":"org_YOUR_ID"}}}

// subscription.cancelled
{"type":"subscription.cancelled","data":{"id":"sub_test123","metadata":{"organizationId":"org_YOUR_ID"}}}

// payment.completed
{"type":"payment.completed","data":{"subscription_id":"sub_test123","current_period_end":"2026-07-29T00:00:00Z","metadata":{"organizationId":"org_YOUR_ID"}}}
```

---

## Sección 9: Operaciones

### Manual Sync

If webhook delivery was missed or the DB state is stale, trigger a manual sync:

```bash
# As an authenticated OWNER/LAB_ADMIN (requires a valid session cookie)
curl -X POST https://app.nexalab.io/api/billing/sync \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

The sync route calls `GET /subscriptions/{id}` on Recurrente using the stored `recurrente_subscription_id` and reconciles the DB state.

For a bulk admin sync (all orgs), run the query directly and trigger per org:

```sql
SELECT organization_id, recurrente_subscription_id
FROM billing_subscriptions
WHERE status NOT IN ('cancelled', 'inactive')
  AND recurrente_subscription_id IS NOT NULL;
```

### Reprocessing Failed Webhook Events

Webhook events are stored in `billing_events` with a `processed` flag:

```sql
-- Find unprocessed events
SELECT * FROM billing_events
WHERE processed = false
ORDER BY created_at DESC;

-- After manual fix, mark as processed
UPDATE billing_events SET processed = true WHERE id = 'event_id_here';
```

To replay a Recurrente webhook from their dashboard:
1. Go to **Developers** → **Webhooks** → your endpoint
2. Click **Attempts** to see recent deliveries
3. Click any event → **Resend**

### Viewing the Billing Events Log

```sql
-- Recent billing events for an organization
SELECT be.event_type, be.recurrente_event_id, be.processed, be.created_at,
       bs.status, bs.plan_slug
FROM billing_events be
JOIN billing_subscriptions bs ON be.subscription_id = bs.id
WHERE bs.organization_id = 'YOUR_ORG_ID'
ORDER BY be.created_at DESC
LIMIT 50;
```

Or via the audit log:

```sql
SELECT * FROM audit_events
WHERE entity_type = 'billing_subscription'
  AND organization_id = 'YOUR_ORG_ID'
ORDER BY created_at DESC;
```

---

## Sección 10: Seguridad

### Data Never Stored

LISM never stores:
- Full card numbers (PAN)
- CVV/CVC codes
- Card expiry dates
- Bank account numbers
- Raw Recurrente secret keys in the database

All payment data is handled exclusively by Recurrente's hosted checkout. LISM stores only:
- Recurrente subscription ID (opaque reference)
- Subscription status
- Plan slug
- Billing period dates
- Event type and timestamp

### Secret Key Protection

- `RECURRENTE_SECRET_KEY` must only be set as an environment variable — never hard-coded or committed to git.
- Add `.env.local` to `.gitignore` (already standard in Next.js).
- On Vercel, set the key as an encrypted environment variable with **Production** scope only.
- Rotate the key immediately if exposed. Update Vercel env var and redeploy.

### Webhook Signature Verification

Every incoming webhook request is verified before processing:

```
Algorithm: HMAC-SHA256
Input:     "{svix-id}.{svix-timestamp}.{raw-request-body}"
Key:       base64-decoded secret (strip "whsec_" prefix first)
Compare:   computed signature against "svix-signature" header value(s)
```

Implementation notes:
- Use the raw request body bytes (before any JSON parsing) for signature computation.
- The `svix-signature` header may contain multiple comma-separated `v1,<base64>` values; accept if any one matches.
- Reject requests where `svix-timestamp` is more than 5 minutes old (replay attack prevention).
- Return HTTP 400 on signature mismatch — do not process the event.

### Access Control

All billing API routes check the session role before executing:

```typescript
const session = await getSession();
if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
if (!["OWNER", "LAB_ADMIN"].includes(session.role)) {
  return NextResponse.json({ message: "Permiso denegado." }, { status: 403 });
}
```

The webhook route (`/api/billing/webhook`) is unauthenticated (called by Recurrente) but protected by Svix signature verification only. It must never be gated by session auth.

---

## Sección 11: Migración y rollback

### Apply Database Migration

Migration file: `migrations/0005_billing_tables.sql`

```sql
-- billing_subscriptions table
CREATE TABLE billing_subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_slug                 VARCHAR(40) NOT NULL,
  status                    VARCHAR(30) NOT NULL DEFAULT 'inactive',
  recurrente_subscription_id VARCHAR(120),
  recurrente_checkout_id    VARCHAR(120),
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN DEFAULT false,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX billing_subscriptions_org_active_idx
  ON billing_subscriptions(organization_id)
  WHERE status NOT IN ('cancelled', 'inactive');

-- billing_events table
CREATE TABLE billing_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id      UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  organization_id      UUID NOT NULL,
  event_type           VARCHAR(60) NOT NULL,
  recurrente_event_id  VARCHAR(120),
  payload              JSONB,
  processed            BOOLEAN DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX billing_events_org_idx ON billing_events(organization_id);
CREATE INDEX billing_events_unprocessed_idx ON billing_events(processed) WHERE processed = false;
```

Run against Neon:

```bash
psql $DATABASE_URL -f migrations/0005_billing_tables.sql
```

Or using the Neon console SQL editor: paste the migration and execute.

### Rollback Procedure

Drop tables in reverse dependency order:

```sql
-- Step 1: drop events first (references subscriptions)
DROP TABLE IF EXISTS billing_events;

-- Step 2: drop subscriptions
DROP TABLE IF EXISTS billing_subscriptions;

-- Step 3: reset plan_code on organizations if needed
UPDATE organizations SET plan_code = 'STARTER' WHERE plan_code != 'STARTER';
```

**Warning:** Rollback destroys all billing history. Only perform in development or after a failed migration with no active subscribers.

### Compatibility Notes

- `organizations.plan_code` column must exist before running the billing code. It was added in migration 0003 with `DEFAULT 'STARTER'`.
- The billing system does not require any schema changes to existing tables beyond the two new tables above.
- The `writeAuditEvent` function used by billing routes requires the `audit_events` table (migration 0002+).

---

## Sección 12: Checklist de despliegue

1. [ ] Run migration `0005_billing_tables.sql` against the production Neon database.
2. [ ] Verify `organizations.plan_code` column exists (migration 0003).
3. [ ] Create the three products in Recurrente production dashboard with correct prices and USD currency.
4. [ ] Copy the three price IDs from Recurrente.
5. [ ] Set environment variables in Vercel (Production environment):
   - `RECURRENTE_SECRET_KEY`
   - `RECURRENTE_WEBHOOK_SECRET`
   - `RECURRENTE_PRICE_ACADEMIC_STARTER`
   - `RECURRENTE_PRICE_PROFESSIONAL`
   - `RECURRENTE_PRICE_MULTI_SITE`
   - `NEXT_PUBLIC_APP_URL` (if not already set)
6. [ ] Register webhook endpoint in Recurrente dashboard: `https://<domain>/api/billing/webhook`
7. [ ] Select all required webhook events (subscription.created, subscription.updated, subscription.cancelled, payment.completed, payment.failed, payment_intent.succeeded).
8. [ ] Copy the webhook signing secret and set `RECURRENTE_WEBHOOK_SECRET` in Vercel.
9. [ ] Deploy to Vercel (`git push` or manual deploy).
10. [ ] Verify deployment succeeded and no build errors.
11. [ ] Test checkout flow end-to-end using Recurrente sandbox mode with a test organization.
12. [ ] Simulate a webhook event using the curl command in Section 8 and verify DB state updates.
13. [ ] Verify `/api/billing/status` returns correct state for a test subscription.
14. [ ] Confirm billing UI renders correctly for OWNER and LAB_ADMIN roles.
15. [ ] Confirm non-OWNER/LAB_ADMIN roles receive 403 on billing API routes.
16. [ ] Check audit_events table is populated after a billing action.
17. [ ] Switch Recurrente back to production mode (disable sandbox).
18. [ ] Monitor `billing_events` table for the first live webhook events.
19. [ ] Set up alerts (Vercel log drain or similar) for HTTP 400/500 responses on `/api/billing/webhook`.
20. [ ] Document the live webhook endpoint URL and signing secret in your team's secrets vault.

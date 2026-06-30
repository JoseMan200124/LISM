import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Plan objects (matching SAAS_PRICING.md)
// ---------------------------------------------------------------------------

export interface BillingPlan {
  slug: string;
  name: string;
  priceUsd: number;
  maxUsers: number;
  maxLabs: number;
  description: string;
}

export const PLAN_ACADEMIC_STARTER: BillingPlan = {
  slug: 'academic_starter',
  name: 'Academic Starter',
  priceUsd: 59,
  maxUsers: 5,
  maxLabs: 1,
  description: 'Ideal for small academic labs.',
};

export const PLAN_PROFESSIONAL: BillingPlan = {
  slug: 'professional',
  name: 'Professional',
  priceUsd: 189,
  maxUsers: 12,
  maxLabs: 1,
  description: 'For growing professional labs.',
};

export const PLAN_MULTI_SITE: BillingPlan = {
  slug: 'multi_site',
  name: 'Multi-site',
  priceUsd: 549,
  maxUsers: 30,
  maxLabs: 3,
  description: 'Multi-lab enterprise solution.',
};

export const ALL_PLANS: BillingPlan[] = [
  PLAN_ACADEMIC_STARTER,
  PLAN_PROFESSIONAL,
  PLAN_MULTI_SITE,
];

// ---------------------------------------------------------------------------
// Subscription objects — one per status in the state machine
// ---------------------------------------------------------------------------

export interface BillingSubscription {
  id: string;
  organizationId: string;
  planSlug: string;
  status:
    | 'inactive'
    | 'checkout_pending'
    | 'pending_activation'
    | 'active'
    | 'cancel_scheduled'
    | 'payment_failed'
    | 'cancelled';
  recurrenteSubscriptionId: string | null;
  recurrenteCustomerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

const BASE_SUBSCRIPTION: BillingSubscription = {
  id: 'sub_test_001',
  organizationId: 'org_test_001',
  planSlug: 'professional',
  status: 'inactive',
  recurrenteSubscriptionId: null,
  recurrenteCustomerId: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const SUBSCRIPTION_INACTIVE: BillingSubscription = {
  ...BASE_SUBSCRIPTION,
  id: 'sub_inactive_001',
  status: 'inactive',
};

export const SUBSCRIPTION_CHECKOUT_PENDING: BillingSubscription = {
  ...BASE_SUBSCRIPTION,
  id: 'sub_checkout_pending_001',
  status: 'checkout_pending',
  updatedAt: '2026-01-02T10:00:00Z',
};

export const SUBSCRIPTION_PENDING_ACTIVATION: BillingSubscription = {
  ...BASE_SUBSCRIPTION,
  id: 'sub_pending_activation_001',
  status: 'pending_activation',
  recurrenteCustomerId: 'cust_rec_001',
  updatedAt: '2026-01-02T11:00:00Z',
};

export const SUBSCRIPTION_ACTIVE: BillingSubscription = {
  ...BASE_SUBSCRIPTION,
  id: 'sub_active_001',
  status: 'active',
  recurrenteSubscriptionId: 'rec_sub_001',
  recurrenteCustomerId: 'cust_rec_001',
  currentPeriodStart: '2026-01-03T00:00:00Z',
  currentPeriodEnd: '2026-02-03T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
};

export const SUBSCRIPTION_CANCEL_SCHEDULED: BillingSubscription = {
  ...SUBSCRIPTION_ACTIVE,
  id: 'sub_cancel_scheduled_001',
  status: 'cancel_scheduled',
  cancelAtPeriodEnd: true,
  updatedAt: '2026-01-15T00:00:00Z',
};

export const SUBSCRIPTION_PAYMENT_FAILED: BillingSubscription = {
  ...SUBSCRIPTION_ACTIVE,
  id: 'sub_payment_failed_001',
  status: 'payment_failed',
  updatedAt: '2026-02-03T01:00:00Z',
};

export const SUBSCRIPTION_CANCELLED: BillingSubscription = {
  ...BASE_SUBSCRIPTION,
  id: 'sub_cancelled_001',
  status: 'cancelled',
  recurrenteSubscriptionId: 'rec_sub_cancelled_001',
  recurrenteCustomerId: 'cust_rec_001',
  currentPeriodStart: '2026-01-03T00:00:00Z',
  currentPeriodEnd: '2026-02-03T00:00:00Z',
  cancelAtPeriodEnd: false,
  updatedAt: '2026-02-03T12:00:00Z',
};

export const ALL_SUBSCRIPTION_STATUSES: BillingSubscription[] = [
  SUBSCRIPTION_INACTIVE,
  SUBSCRIPTION_CHECKOUT_PENDING,
  SUBSCRIPTION_PENDING_ACTIVATION,
  SUBSCRIPTION_ACTIVE,
  SUBSCRIPTION_CANCEL_SCHEDULED,
  SUBSCRIPTION_PAYMENT_FAILED,
  SUBSCRIPTION_CANCELLED,
];

// ---------------------------------------------------------------------------
// Sample Recurrente API responses
// ---------------------------------------------------------------------------

export interface RecurrenteCheckoutResponse {
  id: string;
  url: string;
  status: string;
  metadata: Record<string, string>;
  created_at: string;
  expires_at: string;
}

export const SAMPLE_RECURRENTE_CHECKOUT: RecurrenteCheckoutResponse = {
  id: 'chk_rec_test_001',
  url: 'https://app.recurrente.com/checkout/chk_rec_test_001',
  status: 'open',
  metadata: {
    organizationId: 'org_test_001',
    planSlug: 'professional',
    checkoutId: 'internal_checkout_001',
  },
  created_at: '2026-01-02T10:00:00Z',
  expires_at: '2026-01-03T10:00:00Z',
};

export interface RecurrenteSubscriptionResponse {
  id: string;
  status: string;
  customer_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export const SAMPLE_RECURRENTE_SUBSCRIPTION: RecurrenteSubscriptionResponse = {
  id: 'rec_sub_001',
  status: 'active',
  customer_id: 'cust_rec_001',
  current_period_start: '2026-01-03T00:00:00Z',
  current_period_end: '2026-02-03T00:00:00Z',
  cancel_at_period_end: false,
  metadata: {
    organizationId: 'org_test_001',
    planSlug: 'professional',
  },
  created_at: '2026-01-03T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: string;
  data: object;
}

/**
 * Build a properly structured Recurrente/Svix webhook event payload.
 */
export function createMockWebhookEvent(type: string, data: object): WebhookEvent {
  return {
    id: `evt_${type.replace(/\./g, '_')}_${Date.now()}`,
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

export interface SvixSignatureHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

/**
 * Generate Svix-compatible HMAC-SHA256 signature headers for webhook verification.
 *
 * The signature is computed over "{svix-id}.{svix-timestamp}.{rawBody}" using the
 * base64-decoded secret after stripping the "whsec_" prefix, matching the algorithm
 * described in the Recurrente webhook docs.
 *
 * @param rawBody  The raw JSON string that will be sent as the request body.
 * @param secret   The webhook secret, optionally prefixed with "whsec_".
 */
export function signWebhookEvent(rawBody: string, secret: string): SvixSignatureHeaders {
  const svixId = `msg_${crypto.randomBytes(12).toString('hex')}`;
  const svixTimestamp = Math.floor(Date.now() / 1000).toString();

  const strippedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(strippedSecret, 'base64');

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', keyBytes);
  hmac.update(toSign);
  const signature = hmac.digest('base64');

  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${signature}`,
  };
}

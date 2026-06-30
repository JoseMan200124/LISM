import type { UserSession } from "@/lib/session";

// ─── Plan slugs ────────────────────────────────────────────────────────────────

export const BILLING_PLAN_SLUGS = [
  "academic_starter",
  "professional",
  "multi_site",
] as const;

export type BillingPlanSlug = (typeof BILLING_PLAN_SLUGS)[number];

// ─── Trial constants ───────────────────────────────────────────────────────────

/** Display-only. The authoritative trial end date always comes from Recurrente. */
export const TRIAL_DURATION_MONTHS = 1;

// ─── Subscription status ───────────────────────────────────────────────────────

export type BillingStatus =
  | "inactive"
  | "checkout_pending"
  | "setup_pending"
  | "pending_activation"
  | "trialing"
  | "trial_cancel_scheduled"
  | "trial_canceled"
  | "first_payment_pending"
  | "active"
  | "pending_plan_change"
  | "payment_method_update_pending"
  | "past_due"
  | "payment_failed"
  | "cancel_scheduled"
  | "canceled"
  | "expired"
  | "suspended";

// ─── Database types ────────────────────────────────────────────────────────────

export type BillingPlan = {
  id: string;
  slug: BillingPlanSlug;
  name: string;
  amountInCents: number;
  currency: string;
  maxUsers: number;
  maxLabs: number;
  recurrentePriceId: string | null;
  recurrenteProductId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type BillingSubscription = {
  id: string;
  organizationId: string;
  planSlug: BillingPlanSlug;
  status: BillingStatus;
  recurrenteSubscriptionId: string | null;
  recurrenteCustomerId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  firstChargeAt: Date | null;
  firstPaymentStatus: string | null;
  isTrial: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BillingCheckout = {
  id: string;
  organizationId: string;
  planSlug: BillingPlanSlug;
  status: "pending" | "completed" | "expired" | "canceled";
  recurrenteCheckoutId: string | null;
  recurrenteCheckoutUrl: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, unknown> | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BillingPayment = {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  checkoutId: string | null;
  planSlug: BillingPlanSlug | null;
  status: "pending" | "completed" | "failed" | "refunded";
  amountInCents: number;
  currency: string;
  recurrentePaymentId: string | null;
  recurrentePaymentIntentId: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Plan limits ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<
  BillingPlanSlug,
  { maxUsers: number; maxLabs: number }
> = {
  academic_starter: { maxUsers: 5, maxLabs: 1 },
  professional: { maxUsers: 12, maxLabs: 1 },
  multi_site: { maxUsers: 30, maxLabs: 3 },
};

// ─── Plan code mapping ─────────────────────────────────────────────────────────

export const PLAN_SLUG_TO_PLAN_CODE: Record<BillingPlanSlug, string> = {
  academic_starter: "ACADEMIC_STARTER",
  professional: "PROFESSIONAL",
  multi_site: "MULTI_SITE",
};

// ─── Permission helpers ────────────────────────────────────────────────────────

export function canManageBilling(role: UserSession["role"]): boolean {
  return role === "OWNER" || role === "LAB_ADMIN";
}

// ─── Subscription status helpers ──────────────────────────────────────────────

/** Returns true when the subscription is in a state that grants service access. */
export function isSubscriptionActive(status: BillingStatus): boolean {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "trial_cancel_scheduled" ||
    status === "first_payment_pending" ||
    status === "cancel_scheduled" ||
    status === "pending_plan_change" ||
    status === "payment_method_update_pending"
  );
}

/** Returns true for any trial-specific state (including scheduled trial cancellation). */
export function isSubscriptionTrialing(status: BillingStatus): boolean {
  return (
    status === "trialing" ||
    status === "trial_cancel_scheduled" ||
    status === "first_payment_pending"
  );
}

/**
 * Returns true when the user should have active access to their plan's features.
 * Covers both paid and trial access.
 */
export function hasAccessToService(status: BillingStatus): boolean {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "trial_cancel_scheduled" ||
    status === "first_payment_pending" ||
    status === "cancel_scheduled" ||
    status === "pending_plan_change" ||
    status === "payment_method_update_pending"
  );
}

// ─── Recurrente env var helpers ────────────────────────────────────────────────

function slugToEnvKey(slug: BillingPlanSlug): string {
  return slug.toUpperCase().replace(/-/g, "_");
}

export function getRecurrentePlanPriceId(slug: BillingPlanSlug): string | null {
  const key = `RECURRENTE_PLAN_${slugToEnvKey(slug)}_PRICE_ID`;
  return process.env[key] ?? null;
}

export function getRecurrentePlanProductId(
  slug: BillingPlanSlug
): string | null {
  const key = `RECURRENTE_PLAN_${slugToEnvKey(slug)}_PRODUCT_ID`;
  return process.env[key] ?? null;
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

export function formatPlanAmount(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  return `${currency} $${amount}/mes`;
}

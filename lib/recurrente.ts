import { createHmac } from "crypto";
import type { BillingStatus } from "@/lib/billing-plans";

// ─── Recurrente API types ──────────────────────────────────────────────────────

export interface RecurrenteCheckout {
  id: string;
  checkout_url: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  success_url?: string;
  cancel_url?: string;
  customer_id?: string;
  items?: RecurrenteCheckoutItem[];
  [key: string]: unknown;
}

export interface RecurrenteCheckoutItem {
  name?: string;
  amount_in_cents?: number;
  currency?: string;
  charge_type?: string;
  quantity?: number;
  price_id?: string;
  [key: string]: unknown;
}

export interface RecurrenteSubscriptionItem {
  id?: string;
  name?: string;
  amount_in_cents?: number;
  currency?: string;
  quantity?: number;
  price_id?: string;
  product_id?: string;
  [key: string]: unknown;
}

export interface RecurrenteSubscription {
  id: string;
  status: string;
  items?: RecurrenteSubscriptionItem[];
  payment_method_id?: string | null;
  next_billing_at?: string | null;
  first_billing_at?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  created_at: string;
  updated_at: string;
  customer_id?: string;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RecurrenteCustomer {
  id: string;
  email: string;
  full_name?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RecurrentePaymentIntent {
  id: string;
  status: string;
  amount_in_cents: number;
  currency: string;
  subscription_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RecurrenteWebhookEvent {
  /** Maps to svix-id header */
  id: string;
  type: string;
  data: unknown;
}

export interface RecurrenteProductPrice {
  id: string;
  amount_in_cents: number;
  currency: string;
  billing_interval: string;
  billing_interval_count: number;
  [key: string]: unknown;
}

export interface RecurrenteProduct {
  id: string;
  name: string;
  prices: RecurrenteProductPrice[];
  [key: string]: unknown;
}

// ─── Config helpers ────────────────────────────────────────────────────────────

export function getRecurrenteBaseUrl(): string {
  return (
    process.env.RECURRENTE_API_BASE_URL ?? "https://app.recurrente.com/api"
  );
}

export function getRecurrenteSecretKey(): string {
  const key = process.env.RECURRENTE_SECRET_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "Recurrente no está configurado: falta la variable de entorno RECURRENTE_SECRET_KEY."
    );
  }
  return key;
}

export function recurrenteHeaders(): Record<string, string> {
  return {
    "X-SECRET-KEY": getRecurrenteSecretKey(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ─── Generic fetch wrapper ────────────────────────────────────────────────────

export async function recurrenteFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const baseUrl = getRecurrenteBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...recurrenteHeaders(),
        ...(options?.headers ?? {}),
      },
    });
  } catch (networkError: unknown) {
    const message =
      networkError instanceof Error
        ? networkError.message
        : "Error de red desconocido";
    throw new Error(
      `Error de conexión con Recurrente (${path}): ${message}`
    );
  }

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore body read errors
    }

    let errorMessage = `Recurrente API error ${response.status} en ${path}`;
    if (errorBody) {
      try {
        const parsed = JSON.parse(errorBody) as Record<string, unknown>;
        const detail =
          parsed.message ??
          parsed.error ??
          parsed.detail ??
          parsed.errors;
        if (detail) {
          errorMessage += `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
        } else {
          errorMessage += `: ${errorBody}`;
        }
      } catch {
        errorMessage += `: ${errorBody}`;
      }
    }

    throw new Error(errorMessage);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `Respuesta inválida de Recurrente (${path}): no se pudo parsear JSON`
    );
  }
}

// ─── Checkouts ────────────────────────────────────────────────────────────────

export async function createRecurrenteCheckout(params: {
  planSlug: string;
  planName: string;
  amountCents: number;
  currency: "USD" | "GTQ";
  organizationId: string;
  checkoutId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  priceId?: string;
  withTrial?: boolean;
}): Promise<RecurrenteCheckout> {
  const {
    planSlug,
    planName,
    amountCents,
    currency,
    organizationId,
    checkoutId,
    successUrl,
    cancelUrl,
    customerId,
    priceId,
    withTrial = false,
  } = params;

  let items: RecurrenteCheckoutItem[];

  // Per Recurrente docs: free_trial_interval only works with inline items,
  // NOT with price_id references. When withTrial=true, always use inline items.
  if (priceId && !withTrial) {
    items = [{ price_id: priceId, quantity: 1 }];
  } else {
    const item: RecurrenteCheckoutItem = {
      name: `${planName} — Suscripción mensual`,
      amount_in_cents: amountCents,
      currency,
      charge_type: "recurring",
      billing_interval: "month",
      billing_interval_count: 1,
      quantity: 1,
    };
    if (withTrial) {
      item.free_trial_interval = "month";
      item.free_trial_interval_count = 1;
    }
    items = [item];
  }

  const body: Record<string, unknown> = {
    items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organizationId,
      planSlug,
      internalCheckoutId: checkoutId,
      source: "lism",
      ...(withTrial ? { isTrial: true } : {}),
    },
  };

  if (customerId) {
    body.customer_id = customerId;
  }

  return recurrenteFetch<RecurrenteCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getRecurrenteCheckout(
  checkoutId: string
): Promise<RecurrenteCheckout> {
  return recurrenteFetch<RecurrenteCheckout>(`/checkouts/${checkoutId}`);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function getRecurrenteSubscription(
  subscriptionId: string
): Promise<RecurrenteSubscription> {
  return recurrenteFetch<RecurrenteSubscription>(
    `/subscriptions/${subscriptionId}`
  );
}

export async function cancelRecurrenteSubscription(
  subscriptionId: string
): Promise<RecurrenteSubscription> {
  return recurrenteFetch<RecurrenteSubscription>(
    `/subscriptions/${subscriptionId}`,
    { method: "DELETE" }
  );
}

export async function updateRecurrenteSubscription(
  subscriptionId: string,
  params: { paymentMethodId?: string; act?: string }
): Promise<RecurrenteSubscription> {
  const body: Record<string, unknown> = {};
  if (params.paymentMethodId !== undefined) {
    body.payment_method_id = params.paymentMethodId;
  }
  if (params.act !== undefined) {
    body.act = params.act;
  }

  return recurrenteFetch<RecurrenteSubscription>(
    `/subscriptions/${subscriptionId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function createRecurrenteCustomer(params: {
  email: string;
  fullName: string;
}): Promise<RecurrenteCustomer> {
  return recurrenteFetch<RecurrenteCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      full_name: params.fullName,
    }),
  });
}

/**
 * Finds or creates a Recurrente customer by email.
 * POST /customers is idempotent: if the email already exists it returns the existing customer.
 * Returns null only when there is an unexpected error that is non-fatal.
 */
export async function getRecurrenteCustomerByEmail(
  email: string
): Promise<RecurrenteCustomer | null> {
  try {
    // POST /customers is idempotent by email on Recurrente
    return await recurrenteFetch<RecurrenteCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify({
        email,
        full_name: email, // fallback name; will be overwritten if already exists
      }),
    });
  } catch {
    return null;
  }
}

// ─── Webhook signature verification ──────────────────────────────────────────

export function verifyRecurrenteWebhookSignature(
  rawBody: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  }
): boolean {
  const secret = process.env.RECURRENTE_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[recurrente] RECURRENTE_WEBHOOK_SIGNING_SECRET no está configurado. La verificación de firma está desactivada."
      );
    }
    return false;
  }

  const { svixId, svixTimestamp, svixSignature } = headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Replay protection: reject events older than 5 minutes
  const timestampSeconds = parseInt(svixTimestamp, 10);
  if (isNaN(timestampSeconds)) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 300) {
    return false;
  }

  // Decode the signing secret: strip "whsec_" prefix, then base64 decode
  const rawSecret = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;

  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(rawSecret, "base64");
  } catch {
    return false;
  }

  // Signed content format: "{svix-id}.{svix-timestamp}.{raw-body}"
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

  const expectedDigest = createHmac("sha256", secretBytes)
    .update(signedContent, "utf8")
    .digest("base64");

  // svix-signature header contains space-separated "v1,{base64sig}" values
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    if (!sig.startsWith("v1,")) continue;
    const candidateDigest = sig.slice("v1,".length);
    if (candidateDigest === expectedDigest) {
      return true;
    }
  }

  return false;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapRecurrenteSubscriptionStatus(
  providerStatus: string | null | undefined
): BillingStatus {
  if (!providerStatus) return "inactive";

  switch (providerStatus.toLowerCase()) {
    case "active":
      return "active";
    // Recurrente does not use a "trialing" status — trials are tracked locally
    // via setup_intent events. Map defensively in case a future API version adds it.
    case "trialing":
    case "in_trial":
      return "trialing";
    case "paused":
      return "suspended";
    case "pending":
      return "pending_activation";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    default:
      return "inactive";
  }
}

// ─── Trial helpers ────────────────────────────────────────────────────────────

export function isTrialingStatus(status: BillingStatus): boolean {
  return status === "trialing";
}

// ─── Configuration check ──────────────────────────────────────────────────────

export function isRecurrenteConfigured(): boolean {
  const key = process.env.RECURRENTE_SECRET_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

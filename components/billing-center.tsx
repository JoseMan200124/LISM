"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CreditCard,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  currency: string;
  max_users: number;
  max_labs: number;
  features: string[];
  is_recommended?: boolean;
  is_current?: boolean;
}

interface PaymentMethod {
  brand: string;
  last4: string;
}

interface Subscription {
  id: string;
  status:
    | "inactive"
    | "checkout_pending"
    | "setup_pending"
    | "pending_activation"
    | "trialing"
    | "trial_cancel_scheduled"
    | "trial_canceled"
    | "first_payment_pending"
    | "active"
    | "cancel_scheduled"
    | "payment_failed"
    | "past_due"
    | "canceled"
    | "change_pending"
    | "pending_plan_change"
    | "suspended"
    | "expired";
  plan_slug: string;
  plan_name: string;
  price_cents: number;
  currency: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  payment_method?: PaymentMethod;
  checkout_url?: string;
  is_trial?: boolean;
  trial_ends_at?: string;
  first_charge_at?: string;
}

interface Payment {
  id: string;
  date: string;
  amount_cents: number;
  currency: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  period_start?: string;
  period_end?: string;
  receipt_url?: string;
}

type ModalKind =
  | { type: "subscribe"; plan: Plan; isTrial?: boolean }
  | { type: "change"; plan: Plan; current: Plan | undefined; isTrial?: boolean; trialEndsAt?: string | null }
  | { type: "cancel"; periodEnd: string }
  | { type: "cancel_trial"; priceCents: number; firstChargeAt: string | null }
  | { type: "reactivate" }
  | { type: "reactivate_trial" }
  | null;

type PageStatus =
  | "loading"
  | "sin_suscripcion"
  | "checkout_pendiente"
  | "pendiente_activacion"
  | "activa"
  | "cambio_pendiente"
  | "pago_fallido"
  | "cancelacion_programada"
  | "cancelada"
  | "error_conexion"
  | "prueba_gratuita"
  | "prueba_cancelacion"
  | "prueba_cancelada"
  | "primer_pago_pendiente";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUSD(cents: number): string {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-GT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function derivePageStatus(sub: Subscription | null): PageStatus {
  if (!sub) return "sin_suscripcion";
  switch (sub.status) {
    case "inactive":
      return "sin_suscripcion";
    case "checkout_pending":
    case "setup_pending":
      return "checkout_pendiente";
    case "pending_activation":
      return "pendiente_activacion";
    case "trialing":
      return "prueba_gratuita";
    case "trial_cancel_scheduled":
      return "prueba_cancelacion";
    case "trial_canceled":
      return "prueba_cancelada";
    case "first_payment_pending":
      return "primer_pago_pendiente";
    case "active":
      return sub.cancel_at_period_end ? "cancelacion_programada" : "activa";
    case "cancel_scheduled":
      return "cancelacion_programada";
    case "payment_failed":
    case "past_due":
      return "pago_fallido";
    case "canceled":
    case "expired":
      return "cancelada";
    case "change_pending":
    case "pending_plan_change":
      return "cambio_pendiente";
    default:
      return "sin_suscripcion";
  }
}

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  checkout_pending: "Pago pendiente",
  setup_pending: "Configurando",
  pending_activation: "Activando",
  trialing: "Prueba gratuita",
  trial_cancel_scheduled: "Prueba cancelada",
  trial_canceled: "Prueba terminada",
  first_payment_pending: "Primer pago pendiente",
  cancel_scheduled: "Cancelación programada",
  payment_failed: "Pago fallido",
  past_due: "Pago vencido",
  canceled: "Cancelada",
  expired: "Expirada",
  change_pending: "Cambio pendiente",
  pending_plan_change: "Cambio pendiente",
  succeeded: "Pagado",
  failed: "Fallido",
  pending: "Pendiente",
  refunded: "Reembolsado",
};

function StatusPill({ status }: Readonly<{ status: string }>) {
  let cls = "bc-pill bc-pill-gray";
  if (status === "active" || status === "succeeded") cls = "bc-pill bc-pill-green";
  else if (
    status === "checkout_pending" ||
    status === "setup_pending" ||
    status === "pending_activation" ||
    status === "cancel_scheduled" ||
    status === "change_pending" ||
    status === "pending_plan_change" ||
    status === "pending"
  ) cls = "bc-pill bc-pill-amber";
  else if (status === "payment_failed" || status === "past_due" || status === "failed") cls = "bc-pill bc-pill-red";
  else if (status === "canceled" || status === "expired" || status === "trial_canceled") cls = "bc-pill bc-pill-gray";
  else if (
    status === "trialing" ||
    status === "trial_cancel_scheduled" ||
    status === "first_payment_pending"
  ) cls = "bc-pill bc-pill-trial";
  return <span className={cls}>{STATUS_LABELS[status] ?? status}</span>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h = 16, w }: Readonly<{ h?: number; w?: number | string }>) {
  return (
    <span
      className="bc-skeleton"
      style={{ height: h, width: typeof w === "number" ? w : w ?? "100%" }}
      aria-hidden="true"
    />
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  subscription,
  trialEligible,
  onSubscribe,
  onChangePlan,
}: Readonly<{
  plan: Plan;
  isCurrent: boolean;
  subscription: Subscription | null;
  trialEligible: boolean;
  onSubscribe: (p: Plan) => void;
  onChangePlan: (p: Plan) => void;
}>) {
  const activeStatuses = ["active", "cancel_scheduled", "change_pending", "pending_plan_change", "trialing", "trial_cancel_scheduled", "first_payment_pending"];
  const hasActive = subscription && activeStatuses.includes(subscription.status);
  const isTrialing = subscription?.status === "trialing" || subscription?.status === "trial_cancel_scheduled";
  const isLower = hasActive && plan.price_cents < (subscription?.price_cents ?? 0);
  const isHigher = hasActive && plan.price_cents > (subscription?.price_cents ?? 0);

  let btnLabel = trialEligible && !hasActive ? "Iniciar prueba gratuita" : "Suscribirse";
  let btnDisabled = false;
  if (isCurrent && !isTrialing) {
    btnLabel = "Plan actual";
    btnDisabled = true;
  } else if (isCurrent && isTrialing) {
    btnLabel = "Plan en prueba";
    btnDisabled = true;
  } else if (hasActive && isLower) {
    btnLabel = isTrialing ? "Cambiar al terminar prueba" : "Más económico";
  } else if (hasActive && isHigher) {
    btnLabel = isTrialing ? "Cambiar al terminar prueba" : "Más completo";
  } else if (hasActive) {
    btnLabel = isTrialing ? "Cambiar al terminar prueba" : "Cambiar a este plan";
  }

  function handleClick() {
    if (btnDisabled) return;
    if (hasActive) {
      onChangePlan(plan);
    } else {
      onSubscribe(plan);
    }
  }

  return (
    <article
      className={`bc-plan-card${isCurrent ? " bc-plan-card-current" : ""}${plan.is_recommended ? " bc-plan-card-recommended" : ""}`}
    >
      {trialEligible && !hasActive && (
        <div className="bc-plan-badge bc-plan-badge-trial">Primer mes GRATIS</div>
      )}
      {plan.is_recommended && !isCurrent && !trialEligible && (
        <div className="bc-plan-badge bc-plan-badge-recommended">Recomendado</div>
      )}
      {isCurrent && !isTrialing && (
        <div className="bc-plan-badge bc-plan-badge-current">Plan actual</div>
      )}
      {isCurrent && isTrialing && (
        <div className="bc-plan-badge bc-plan-badge-trial-active">Prueba activa</div>
      )}
      <p className="bc-plan-name">{plan.name}</p>
      {trialEligible && !hasActive ? (
        <div className="bc-plan-price-trial">
          <p className="bc-plan-trial-free">Sin costo hoy</p>
          <p className="bc-plan-trial-later">Luego {formatUSD(plan.price_cents)}/mes</p>
        </div>
      ) : (
        <p className="bc-plan-price">
          <strong>{formatUSD(plan.price_cents)}</strong>
          <span>/mes</span>
        </p>
      )}
      <ul className="bc-plan-limits">
        <li>
          <Check size={13} />
          Hasta {plan.max_users} usuarios
        </li>
        <li>
          <Check size={13} />
          {plan.max_labs === 1 ? "1 laboratorio" : `${plan.max_labs} laboratorios`}
        </li>
        {plan.features.map((f) => (
          <li key={f}>
            <Check size={13} />
            {f}
          </li>
        ))}
      </ul>
      <button
        className={isCurrent ? "secondary-button bc-plan-btn" : "primary-button bc-plan-btn"}
        disabled={btnDisabled}
        onClick={handleClick}
        aria-label={`${btnLabel}: ${plan.name}`}
      >
        {btnLabel}
      </button>
    </article>
  );
}

// ─── Payment History Table ─────────────────────────────────────────────────────

function PaymentHistory({ payments, loading }: Readonly<{ payments: Payment[]; loading: boolean }>) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel bc-history-panel" data-tutorial="billing-history">
      <button
        className="bc-history-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="bc-section-label">Historial de pagos</span>
        <ChevronDown size={15} className={open ? "bc-chevron-open" : ""} />
      </button>
      {open && (
        <div className="table-scroll bc-history-body">
          {loading ? (
            <div className="bc-history-loading">
              <Skeleton h={12} w={120} />
            </div>
          ) : payments.length === 0 ? (
            <div className="bc-empty-history">
              <CreditCard size={24} strokeWidth={1.5} />
              <p>Aún no hay pagos registrados.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Período</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatUSD(p.amount_cents)}
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>
                      {p.period_start && p.period_end
                        ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}`
                        : "—"}
                    </td>
                    <td>
                      {p.receipt_url && (
                        <a
                          href={p.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bc-receipt-link"
                          aria-label="Ver comprobante"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalLayer({
  modal,
  busy,
  onConfirm,
  onClose,
}: Readonly<{
  modal: ModalKind;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}>) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    setAgreed(false);
  }, [modal]);

  if (!modal) return null;

  let title = "";
  let body: React.ReactNode = null;
  let confirmLabel = "Confirmar";
  let confirmDisabled = busy;

  if (modal.type === "subscribe") {
    title = modal.isTrial ? "Iniciar prueba gratuita" : "Confirmar suscripción";
    confirmLabel = modal.isTrial ? "Iniciar prueba gratuita" : "Suscribirme";
    confirmDisabled = busy || !agreed;
    if (modal.isTrial) {
      body = (
        <>
          <div className="bc-trial-modal-banner">
            <span className="bc-trial-modal-tag">1 mes GRATIS</span>
            <span className="bc-trial-modal-plan">{modal.plan.name}</span>
          </div>
          <div className="modal-note" style={{ marginTop: 12 }}>
            <strong>No se cobra hoy.</strong> Tu período de prueba gratuita dura 1 mes completo.
            Al finalizar, se cobrará automáticamente{" "}
            <strong>{formatUSD(modal.plan.price_cents)}/mes</strong> si no cancelas antes.
          </div>
          <div className="bc-trial-modal-steps">
            <div className="bc-trial-step">
              <span className="bc-trial-step-num">1</span>
              <span>Ingresa tu tarjeta en la página de Recurrente (tokenización, sin cobro).</span>
            </div>
            <div className="bc-trial-step">
              <span className="bc-trial-step-num">2</span>
              <span>Accede a LISM durante 1 mes sin costo.</span>
            </div>
            <div className="bc-trial-step">
              <span className="bc-trial-step-num">3</span>
              <span>Al terminar la prueba se cobra {formatUSD(modal.plan.price_cents)}/mes automáticamente.</span>
            </div>
          </div>
          <label className="check-line" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            Entiendo que al finalizar mi período de prueba se cobrará automáticamente{" "}
            {formatUSD(modal.plan.price_cents)}/mes y acepto los{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="bc-terms-link">
              términos de servicio
            </a>
            .
          </label>
        </>
      );
    } else {
      body = (
        <>
          <div className="modal-note">
            <strong>{modal.plan.name}</strong> — {formatUSD(modal.plan.price_cents)}/mes
            <br />
            Se generará un cobro recurrente mensual. Puedes cancelar en cualquier momento antes del siguiente ciclo.
          </div>
          <label className="check-line" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            Acepto cobros mensuales de {formatUSD(modal.plan.price_cents)} y los{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="bc-terms-link">
              términos de servicio
            </a>
            .
          </label>
        </>
      );
    }
  } else if (modal.type === "change") {
    title = "Cambiar plan";
    confirmLabel = "Confirmar cambio";
    const currentPrice = modal.current?.price_cents ?? 0;
    const diff = modal.plan.price_cents - currentPrice;
    body = (
      <>
        <div className="bc-change-compare">
          <div>
            <span className="bc-compare-label">Plan actual</span>
            <strong>{modal.current?.name ?? "—"}</strong>
            <span>{formatUSD(currentPrice)}/mes</span>
          </div>
          <div className="bc-compare-arrow">→</div>
          <div>
            <span className="bc-compare-label">Nuevo plan</span>
            <strong>{modal.plan.name}</strong>
            <span>{formatUSD(modal.plan.price_cents)}/mes</span>
          </div>
        </div>
        {modal.isTrial ? (
          <p className="modal-note" style={{ marginTop: 12, color: "#4a6e7a" }}>
            Estás en período de prueba. El cambio de plan se aplicará{" "}
            {modal.trialEndsAt ? `el ${formatDate(modal.trialEndsAt)}` : "al finalizar tu prueba gratuita"}.
          </p>
        ) : diff !== 0 ? (
          <p className="modal-note" style={{ marginTop: 12 }}>
            {diff > 0
              ? `La diferencia de ${formatUSD(Math.abs(diff))}/mes se aplicará en el siguiente ciclo.`
              : `Recibirás un crédito prorrateado de ${formatUSD(Math.abs(diff))}/mes en el siguiente ciclo.`}
          </p>
        ) : null}
      </>
    );
  } else if (modal.type === "cancel_trial") {
    title = "Cancelar prueba gratuita";
    confirmLabel = "Cancelar prueba";
    body = (
      <div>
        <div className="bc-trial-cancel-info">
          {modal.firstChargeAt && (
            <p>
              <strong>No se realizará el cobro</strong> de{" "}
              {formatUSD(modal.priceCents)} programado para el{" "}
              <strong>{formatDate(modal.firstChargeAt)}</strong>.
            </p>
          )}
          <p>Conservarás el acceso hasta que termine el período de prueba.</p>
          <p>Tus datos se conservan y puedes reactivar la prueba en cualquier momento antes de que termine.</p>
        </div>
        <div className="bc-trial-cancel-warn" role="note">
          <AlertTriangle size={14} />
          <span>
            Si cancelas ahora, <strong>no podrás usar otra prueba gratuita</strong> para esta organización.
          </span>
        </div>
      </div>
    );
  } else if (modal.type === "cancel") {
    title = "Cancelar suscripción";
    confirmLabel = "Cancelar suscripción";
    body = (
      <div className="modal-note">
        <strong>Tu acceso se mantendrá activo</strong> hasta el{" "}
        {formatDate(modal.periodEnd)}.<br />
        Tus datos se conservan. Puedes reactivar en cualquier momento.
      </div>
    );
  } else if (modal.type === "reactivate" || modal.type === "reactivate_trial") {
    title = modal.type === "reactivate_trial" ? "Reactivar prueba gratuita" : "Reactivar suscripción";
    confirmLabel = modal.type === "reactivate_trial" ? "Reactivar prueba" : "Reactivar";
    body = (
      <p className="modal-form" style={{ margin: 0 }}>
        {modal.type === "reactivate_trial"
          ? "Tu prueba gratuita se reactivará y el primer cobro se procesará normalmente al finalizar el período."
          : "Tu suscripción se renovará normalmente al final del período actual."}
      </p>
    );
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" />
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-icon">
            <CreditCard size={16} />
          </div>
          <div>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar modal">
            <X size={15} />
          </button>
        </div>
        <div className="modal-form">
          {body}
          <footer className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={
                modal.type === "cancel" || modal.type === "cancel_trial"
                  ? "bc-btn-danger"
                  : "primary-button"
              }
              onClick={onConfirm}
              disabled={confirmDisabled}
            >
              {busy ? (
                <>
                  <RefreshCw size={13} className="spin" /> Procesando…
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BillingCenter() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [trialEligible, setTrialEligible] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadAll() {
    setPageStatus("loading");
    setErrorMsg(null);
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch("/api/billing/plans"),
        fetch("/api/billing/subscription"),
      ]);
      if (!plansRes.ok || !subRes.ok) throw new Error("Error al cargar datos de facturación.");

      const plansJson = await plansRes.json() as { data?: unknown[] } | unknown[];
      const subJson = await subRes.json() as {
        data?: Record<string, unknown> | null;
        trial_eligible?: boolean;
        mode?: string;
      };

      const rawPlansArray = (Array.isArray(plansJson)
        ? plansJson
        : (plansJson as { data?: unknown[] }).data ?? []) as Array<Record<string, unknown>>;
      // La API (/api/billing/plans) devuelve `price_monthly_cents`, no
      // `price_cents` — sin este mapeo el precio se mostraba como "USDNaN"
      // en la pantalla de selección de plan (bug preexistente, corregido
      // aquí sin tocar precios, límites ni el endpoint).
      const plansArray = rawPlansArray.map((plan) => ({
        ...plan,
        price_cents: (plan.price_cents ?? plan.price_monthly_cents ?? 0) as number,
      })) as Plan[];

      const rawSub = subJson.data ?? null;
      const trialEl: boolean = subJson.trial_eligible ?? true;

      let subData: Subscription | null = null;
      if (rawSub) {
        const r = rawSub as Record<string, unknown>;
        const plan = (r.plan ?? {}) as Record<string, unknown>;
        subData = {
          id: r.id as string,
          status: r.status as Subscription["status"],
          plan_slug: (plan.slug ?? r.plan_slug ?? "") as string,
          plan_name: (plan.name ?? r.plan_name ?? "") as string,
          price_cents: (plan.price_monthly_cents ?? r.price_cents ?? 0) as number,
          currency: (plan.currency ?? r.currency ?? "USD") as string,
          current_period_end: (r.current_period_end ?? undefined) as string | undefined,
          cancel_at_period_end: (r.cancel_at_period_end ?? false) as boolean,
          payment_method:
            r.payment_method_brand
              ? { brand: r.payment_method_brand as string, last4: (r.payment_method_masked ?? "••••") as string }
              : undefined,
          checkout_url: undefined,
          is_trial: (r.is_trial ?? false) as boolean,
          trial_ends_at: (r.trial_ends_at ?? undefined) as string | undefined,
          first_charge_at: (r.first_charge_at ?? undefined) as string | undefined,
        };
      }

      setPlans(plansArray);
      setSubscription(subData);
      setTrialEligible(trialEl);
      setPageStatus(derivePageStatus(subData));
    } catch {
      setPageStatus("error_conexion");
      setErrorMsg("No se pudieron cargar los datos de facturación. Verifica tu conexión.");
    }
  }

  async function loadPayments() {
    setLoadingPayments(true);
    try {
      const res = await fetch("/api/billing/history");
      if (res.ok) {
        const json = await res.json() as { data?: Payment[] } | Payment[];
        const data = Array.isArray(json) ? json : ((json as { data?: Payment[] }).data ?? []);
        setPayments(data);
      }
    } catch {
      // non-critical; history stays empty
    } finally {
      setLoadingPayments(false);
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPolling() {
    pollCount.current = 0;
    function poll() {
      if (pollCount.current >= 5) return;
      pollCount.current++;
      pollTimer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/billing/sync", { method: "POST" });
          if (res.ok) {
            const json = await res.json() as { data?: Record<string, unknown> };
            const d = json.data ?? json as Record<string, unknown>;
            if (d.status) {
              const status = d.status as Subscription["status"];
              const partialSub: Partial<Subscription> = { status };
              const derived = derivePageStatus(partialSub as Subscription);
              setPageStatus(derived);
              if (derived !== "pendiente_activacion" && derived !== "checkout_pendiente") {
                await loadAll();
                return;
              }
            }
          }
        } catch {
          // continue polling silently
        }
        poll();
      }, 10_000);
    }
    poll();
  }

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }

  // ── Mount ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setCheckoutMsg("Verificando activación…");
      setPageStatus("pendiente_activacion");
    } else if (params.get("checkout") === "canceled") {
      setCheckoutMsg("El pago fue cancelado. Puedes intentarlo de nuevo.");
    } else if (params.get("plan_change") === "success") {
      setCheckoutMsg("Cambio de plan procesado correctamente.");
    }

    loadAll();
    loadPayments();

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pageStatus === "checkout_pendiente" || pageStatus === "pendiente_activacion") {
      startPolling();
    } else {
      stopPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStatus]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function postAction(endpoint: string, body?: object): Promise<Response> {
    return fetch(`/api/billing/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function handleSubscribe(plan: Plan) {
    setActionBusy(true);
    try {
      const res = await postAction("subscribe", { planId: plan.id });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Error al iniciar pago.");
      }
      const json = await res.json() as { data?: { checkoutUrl?: string }; checkoutUrl?: string };
      const url = json.data?.checkoutUrl ?? (json as Record<string, unknown>).checkoutUrl as string | undefined;
      if (url) window.location.href = url;
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo iniciar el proceso de pago. Intenta de nuevo.");
    } finally {
      setActionBusy(false);
      setModal(null);
    }
  }

  async function handleChangePlan(plan: Plan) {
    setActionBusy(true);
    try {
      const res = await postAction("change-plan", { planId: plan.id });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Error al cambiar plan.");
      }
      const json = await res.json() as { data?: { checkoutUrl?: string; isTrialPlanChange?: boolean; effectiveAt?: string } };
      const d = json.data ?? (json as Record<string, unknown>);
      if ((d as Record<string, unknown>).checkoutUrl) {
        window.location.href = (d as Record<string, unknown>).checkoutUrl as string;
      } else if ((d as Record<string, unknown>).isTrialPlanChange) {
        const effectiveAt = (d as Record<string, unknown>).effectiveAt as string | undefined;
        setCheckoutMsg(
          `El plan cambiará a ${plan.name} al finalizar tu prueba gratuita${effectiveAt ? ` (${formatDate(effectiveAt)})` : ""}.`
        );
        await loadAll();
      } else {
        await loadAll();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo cambiar el plan. Intenta de nuevo.");
    } finally {
      setActionBusy(false);
      setModal(null);
    }
  }

  async function handleCancel() {
    setActionBusy(true);
    try {
      const res = await postAction("cancel");
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Error al cancelar.");
      }
      await loadAll();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo cancelar la suscripción. Intenta de nuevo.");
    } finally {
      setActionBusy(false);
      setModal(null);
    }
  }

  async function handleReactivate() {
    setActionBusy(true);
    try {
      const res = await postAction("reactivate");
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Error al reactivar.");
      }
      const json = await res.json() as { data?: { checkoutUrl?: string; requiresCheckout?: boolean } };
      const d = json.data ?? (json as Record<string, unknown>);
      if ((d as Record<string, unknown>).checkoutUrl) {
        window.location.href = (d as Record<string, unknown>).checkoutUrl as string;
      } else {
        await loadAll();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo reactivar la suscripción. Intenta de nuevo.");
    } finally {
      setActionBusy(false);
      setModal(null);
    }
  }

  async function handleUpdateCard() {
    setActionBusy(true);
    try {
      const res = await postAction("payment-method");
      if (!res.ok) throw new Error();
      const json = await res.json() as { data?: { checkoutUrl?: string }; checkoutUrl?: string };
      const url = json.data?.checkoutUrl ?? (json as Record<string, unknown>).checkoutUrl as string | undefined;
      if (url) window.location.href = url;
    } catch {
      setErrorMsg("No se pudo iniciar la actualización del método de pago.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSync() {
    setActionBusy(true);
    try {
      const res = await postAction("sync");
      if (res.ok) {
        await loadAll();
      }
    } catch {
      setErrorMsg("Error al sincronizar.");
    } finally {
      setActionBusy(false);
    }
  }

  // ── Modal confirm dispatch ─────────────────────────────────────────────────

  function confirmModal() {
    if (!modal) return;
    if (modal.type === "subscribe") handleSubscribe(modal.plan);
    else if (modal.type === "change") handleChangePlan(modal.plan);
    else if (modal.type === "cancel" || modal.type === "cancel_trial") handleCancel();
    else if (modal.type === "reactivate" || modal.type === "reactivate_trial") handleReactivate();
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const currentPlan = plans.find((p) => p.slug === subscription?.plan_slug);
  const isTrialing = pageStatus === "prueba_gratuita" || pageStatus === "prueba_cancelacion" || pageStatus === "primer_pago_pendiente";
  const canManage =
    pageStatus === "activa" ||
    pageStatus === "cancelacion_programada" ||
    pageStatus === "cambio_pendiente" ||
    pageStatus === "pago_fallido" ||
    isTrialing;

  // ── Render: loading ────────────────────────────────────────────────────────

  if (pageStatus === "loading") {
    return (
      <div className="billing-center page-stack" aria-busy="true" aria-label="Cargando facturación">
        <header className="page-header">
          <div>
            <p className="eyebrow">FACTURACIÓN</p>
            <h1>Centro de facturación</h1>
          </div>
        </header>
        <div className="panel bc-summary-panel bc-skeleton-block">
          <div className="bc-summary-inner">
            <Skeleton h={14} w={80} />
            <Skeleton h={28} w={160} />
            <Skeleton h={12} w={220} />
          </div>
        </div>
        <div className="bc-plans-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bc-plan-card bc-skeleton-block">
              <Skeleton h={14} w={100} />
              <Skeleton h={30} w={130} />
              <Skeleton h={11} w="80%" />
              <Skeleton h={11} w="60%" />
              <Skeleton h={11} w="70%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────────

  if (pageStatus === "error_conexion") {
    return (
      <div className="billing-center page-stack">
        <header className="page-header">
          <div>
            <p className="eyebrow">FACTURACIÓN</p>
            <h1>Centro de facturación</h1>
          </div>
        </header>
        <div className="bc-error-state panel">
          <AlertTriangle size={28} strokeWidth={1.5} />
          <p>{errorMsg ?? "No se pudo conectar con el servicio de facturación."}</p>
          <button className="primary-button" onClick={loadAll}>
            <RefreshCw size={14} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ── Render: main ───────────────────────────────────────────────────────────

  return (
    <>
      <div className="billing-center page-stack">

        {/* Page header */}
        <header className="page-header">
          <div>
            <p className="eyebrow">ORGANIZACIÓN</p>
            <h1>Centro de facturación</h1>
            <p>Gestiona tu plan, método de pago y revisa el historial de cobros.</p>
          </div>
          <div className="header-actions">
            <button
              className="secondary-button"
              onClick={handleSync}
              disabled={actionBusy}
              aria-label="Sincronizar estado de facturación"
            >
              <RefreshCw size={14} className={actionBusy ? "spin" : ""} />
              Sincronizar
            </button>
          </div>
        </header>

        {/* Checkout return messages */}
        {checkoutMsg && (
          <div className={`bc-banner ${checkoutMsg.startsWith("Verificando") ? "bc-banner-info" : "bc-banner-info"}`}>
            {checkoutMsg.startsWith("Verificando") && <RefreshCw size={15} className="spin" />}
            {checkoutMsg}
            <button
              className="bc-banner-close"
              onClick={() => setCheckoutMsg(null)}
              aria-label="Cerrar aviso"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Error toast */}
        {errorMsg && (
          <div className="bc-banner bc-banner-error" role="alert">
            <AlertTriangle size={15} />
            {errorMsg}
            <button
              className="bc-banner-close"
              onClick={() => setErrorMsg(null)}
              aria-label="Cerrar error"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Pending activation ─────────────────────────────────────────────── */}

        {pageStatus === "pendiente_activacion" && (
          <div className="panel bc-summary-panel bc-activation-state">
            <RefreshCw size={20} className="spin" strokeWidth={1.5} />
            <div>
              <p className="bc-activation-title">Verificando activación…</p>
              <p className="bc-activation-sub">Esto puede tardar unos momentos. La página se actualizará automáticamente.</p>
            </div>
          </div>
        )}

        {/* ── Checkout pendiente ────────────────────────────────────────────── */}

        {pageStatus === "checkout_pendiente" && (
          <div className="bc-banner bc-banner-warn">
            <AlertTriangle size={15} />
            Tienes un pago pendiente de completar.
            {subscription?.checkout_url && (
              <a
                href={subscription.checkout_url}
                className="bc-banner-action"
                rel="noopener noreferrer"
              >
                Completar pago <ExternalLink size={12} />
              </a>
            )}
            <button
              className="bc-banner-action"
              style={{ background: "none", border: 0, cursor: "pointer" }}
              onClick={() => {
                if (currentPlan) setModal({ type: "subscribe", plan: currentPlan, isTrial: trialEligible });
              }}
            >
              Reiniciar checkout
            </button>
          </div>
        )}

        {/* ── Pago fallido (paid) ───────────────────────────────────────────── */}

        {pageStatus === "pago_fallido" && !isTrialing && (
          <div className="bc-banner bc-banner-error" role="alert">
            <AlertTriangle size={15} />
            <span>
              <strong>Pago fallido.</strong> Actualiza tu método de pago para mantener el acceso.
            </span>
            <button
              className="bc-banner-action"
              onClick={handleUpdateCard}
              disabled={actionBusy}
            >
              Actualizar tarjeta <CreditCard size={12} />
            </button>
          </div>
        )}

        {/* ── Primer pago pendiente (trial → paid failed) ───────────────────── */}

        {pageStatus === "primer_pago_pendiente" && (
          <div className="bc-banner bc-banner-error" role="alert">
            <AlertTriangle size={15} />
            <span>
              <strong>El primer cobro de tu prueba gratuita falló.</strong> Actualiza tu método de pago para continuar.
            </span>
            <button
              className="bc-banner-action"
              onClick={handleUpdateCard}
              disabled={actionBusy}
            >
              Actualizar tarjeta <CreditCard size={12} />
            </button>
          </div>
        )}

        {/* ── Cancelación programada (paid) ─────────────────────────────────── */}

        {pageStatus === "cancelacion_programada" && subscription?.current_period_end && (
          <div className="bc-banner bc-banner-warn">
            <AlertTriangle size={15} />
            <span>
              Cancelación programada. Mantendrás el acceso hasta el{" "}
              <strong>{formatDate(subscription.current_period_end)}</strong>.
            </span>
            <button
              className="bc-banner-action"
              onClick={() => setModal({ type: "reactivate" })}
              disabled={actionBusy}
            >
              Reactivar
            </button>
          </div>
        )}

        {/* ── Prueba gratuita activa ────────────────────────────────────────── */}

        {pageStatus === "prueba_gratuita" && subscription && (
          <div className="bc-banner bc-banner-trial">
            <span className="bc-trial-banner-badge">PRUEBA GRATUITA</span>
            <span>
              Tu período de prueba termina el{" "}
              <strong>
                {subscription.trial_ends_at ? formatDate(subscription.trial_ends_at) : "—"}
              </strong>
              .
              {subscription.first_charge_at && (
                <> Primer cobro: <strong>{formatUSD(subscription.price_cents)}</strong> el{" "}
                  <strong>{formatDate(subscription.first_charge_at)}</strong>.</>
              )}
            </span>
            <button
              className="bc-banner-action"
              onClick={() => setModal({
                type: "cancel_trial",
                priceCents: subscription.price_cents,
                firstChargeAt: subscription.first_charge_at ?? null,
              })}
              disabled={actionBusy}
            >
              Cancelar prueba
            </button>
          </div>
        )}

        {/* ── Prueba cancelada (trial_cancel_scheduled) ─────────────────────── */}

        {pageStatus === "prueba_cancelacion" && subscription && (
          <div className="bc-banner bc-banner-warn">
            <AlertTriangle size={15} />
            <span>
              Prueba cancelada. Conservas acceso hasta el{" "}
              <strong>
                {subscription.trial_ends_at ? formatDate(subscription.trial_ends_at) : "—"}
              </strong>
              . No se realizará ningún cobro.
            </span>
            <button
              className="bc-banner-action"
              onClick={() => setModal({ type: "reactivate_trial" })}
              disabled={actionBusy}
            >
              Reactivar prueba
            </button>
          </div>
        )}

        {/* ── Prueba terminada (trial_canceled) ─────────────────────────────── */}

        {pageStatus === "prueba_cancelada" && (
          <div className="bc-banner bc-banner-warn">
            <AlertTriangle size={15} />
            Tu período de prueba gratuita ha terminado. Suscríbete para continuar usando LISM.
          </div>
        )}

        {/* ── Cambio pendiente ──────────────────────────────────────────────── */}

        {pageStatus === "cambio_pendiente" && (
          <div className="bc-banner bc-banner-info">
            <RefreshCw size={14} />
            Cambio de plan pendiente. Se aplicará al inicio del siguiente ciclo.
          </div>
        )}

        {/* ── SECTION A: Current Plan Summary ───────────────────────────────── */}

        {canManage && subscription && (
          <section className="panel bc-summary-panel" aria-label="Resumen del plan actual" data-tutorial="billing-plan-summary">
            <div className="bc-summary-inner">
              <div className="bc-summary-main">
                <div className="bc-summary-plan-row">
                  <span className="bc-plan-name-badge">{subscription.plan_name}</span>
                  <StatusPill status={subscription.status} />
                  {isTrialing && (
                    <span className="bc-trial-summary-badge">Prueba gratuita</span>
                  )}
                </div>
                {isTrialing ? (
                  <>
                    <p className="bc-summary-price bc-summary-price-trial">
                      Sin costo
                      <span className="bc-summary-period"> durante la prueba</span>
                    </p>
                    <p className="bc-summary-meta">
                      Luego {formatUSD(subscription.price_cents)}/mes
                    </p>
                    {subscription.trial_ends_at && (
                      <p className="bc-summary-meta">
                        Prueba termina: <strong>{formatDate(subscription.trial_ends_at)}</strong>
                      </p>
                    )}
                    {pageStatus === "prueba_gratuita" && subscription.first_charge_at && (
                      <p className="bc-summary-meta">
                        Primer cobro: <strong>{formatDate(subscription.first_charge_at)}</strong>
                      </p>
                    )}
                    {pageStatus === "prueba_cancelacion" && (
                      <p className="bc-summary-meta" style={{ color: "#a06020" }}>
                        No habrá cobro — prueba cancelada
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="bc-summary-price">
                      {formatUSD(subscription.price_cents)}
                      <span className="bc-summary-period">/mes</span>
                    </p>
                    {subscription.current_period_end && (
                      <p className="bc-summary-meta">
                        {subscription.cancel_at_period_end
                          ? `Acceso hasta: ${formatDate(subscription.current_period_end)}`
                          : `Próximo cobro: ${formatDate(subscription.current_period_end)}`}
                      </p>
                    )}
                  </>
                )}
                {subscription.payment_method && (
                  <p className="bc-summary-payment-method">
                    <CreditCard size={14} />
                    {subscription.payment_method.brand} •••• {subscription.payment_method.last4}
                  </p>
                )}
              </div>
              <div className="bc-summary-actions">
                {pageStatus === "prueba_gratuita" && (
                  <button
                    className="secondary-button"
                    onClick={() => setModal({
                      type: "cancel_trial",
                      priceCents: subscription.price_cents,
                      firstChargeAt: subscription.first_charge_at ?? null,
                    })}
                    disabled={actionBusy}
                  >
                    Cancelar prueba
                  </button>
                )}
                {(pageStatus === "activa" || pageStatus === "cambio_pendiente") && (
                  <button
                    className="secondary-button"
                    onClick={() => setModal({ type: "cancel", periodEnd: subscription.current_period_end ?? new Date().toISOString() })}
                    disabled={actionBusy}
                  >
                    Cancelar suscripción
                  </button>
                )}
                {pageStatus === "cancelacion_programada" && (
                  <button
                    className="secondary-button"
                    onClick={() => setModal({ type: "reactivate" })}
                    disabled={actionBusy}
                  >
                    Reactivar
                  </button>
                )}
                {pageStatus === "prueba_cancelacion" && (
                  <button
                    className="secondary-button"
                    onClick={() => setModal({ type: "reactivate_trial" })}
                    disabled={actionBusy}
                  >
                    Reactivar prueba
                  </button>
                )}
                {pageStatus !== "pago_fallido" && pageStatus !== "primer_pago_pendiente" && !isTrialing && subscription.payment_method && (
                  <button
                    className="secondary-button"
                    onClick={handleUpdateCard}
                    disabled={actionBusy}
                  >
                    <CreditCard size={14} />
                    Actualizar tarjeta
                  </button>
                )}
                {(pageStatus === "pago_fallido" || pageStatus === "primer_pago_pendiente") && (
                  <button
                    className="secondary-button"
                    onClick={handleUpdateCard}
                    disabled={actionBusy}
                  >
                    <CreditCard size={14} />
                    Actualizar tarjeta
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── SECTION B: Plan Comparison ────────────────────────────────────── */}

        <section aria-label="Planes disponibles">
          <div className="bc-plans-header">
            <h2 className="bc-section-heading">Planes disponibles</h2>
            {(pageStatus === "sin_suscripcion" || pageStatus === "cancelada" || pageStatus === "prueba_cancelada") && (
              <p className="bc-plans-subhead">
                {trialEligible && pageStatus === "sin_suscripcion"
                  ? "Elige tu plan e inicia 1 mes de prueba gratuita. Sin costo hoy, cancela cuando quieras."
                  : pageStatus === "cancelada" || pageStatus === "prueba_cancelada"
                  ? "Tu suscripción fue cancelada. Puedes volver a suscribirte cuando quieras."
                  : "Elige el plan que mejor se adapte al tamaño de tu organización."}
              </p>
            )}
          </div>
          {plans.length === 0 ? (
            <div className="bc-empty-plans">
              <Skeleton h={220} />
              <Skeleton h={220} />
              <Skeleton h={220} />
            </div>
          ) : (
            <div className="bc-plans-grid">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isCurrent={plan.slug === subscription?.plan_slug && canManage}
                  subscription={subscription}
                  trialEligible={trialEligible && !canManage}
                  onSubscribe={(p) => setModal({ type: "subscribe", plan: p, isTrial: trialEligible && !canManage })}
                  onChangePlan={(p) => setModal({
                    type: "change",
                    plan: p,
                    current: currentPlan,
                    isTrial: isTrialing,
                    trialEndsAt: subscription?.trial_ends_at ?? null,
                  })}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── SECTION C: Payment History ────────────────────────────────────── */}

        <PaymentHistory payments={payments} loading={loadingPayments} />

        {/* ── Modals ─────────────────────────────────────────────────────────── */}

        <ModalLayer
          modal={modal}
          busy={actionBusy}
          onConfirm={confirmModal}
          onClose={() => setModal(null)}
        />
      </div>
    </>
  );
}

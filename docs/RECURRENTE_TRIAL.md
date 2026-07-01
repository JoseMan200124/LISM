# RECURRENTE_TRIAL.md — Free Trial System Documentation

System: LISM
Payment processor: Recurrente (https://app.recurrente.com)
Last updated: 2026-06-29

---

## Resumen

LISM ofrece **1 mes de prueba gratuita** en los tres planes de suscripción. La prueba:

- Requiere que el usuario registre una tarjeta en Recurrente (tokenización, sin cobro inmediato).
- No genera ningún cargo durante el período de prueba.
- Al finalizar el mes, se realiza el primer cobro automáticamente.
- Puede cancelarse en cualquier momento antes del final del período sin costo.
- Solo se permite **una prueba gratuita por organización en toda su vida**, incluso si cambia de plan, cancela y re-suscribe.

---

## Arquitectura

### Flujo completo

```
Usuario elige plan → [Frontend] modal de prueba con consentimiento
    → POST /api/billing/subscribe  (withTrial: true)
    → createRecurrenteCheckout (inline item con free_trial_interval: "month")
    → Usuario completa tokenización en Recurrente
    → Recurrente dispara webhook: setup_intent.succeeded
    → [Webhook] activa prueba, crea billing_trial_usage
    → Estado local: trialing
    → [1 mes después] Recurrente cobra y dispara payment.completed
    → [Webhook] transiciona trialing → active, registra pago
```

### Por qué `setup_intent` y no estado de suscripción

Recurrente **no tiene un estado "trialing"** en sus suscripciones. Durante el período de prueba, la API de Recurrente devuelve `status: "active"` para la suscripción. Por este motivo:

1. La activación de la prueba se detecta mediante el evento `setup_intent.succeeded`, que se dispara cuando Recurrente tokeniza exitosamente la tarjeta del usuario al crear la suscripción de prueba.
2. El estado `trialing` es **local** a la base de datos de LISM.
3. Durante la sincronización (`/api/billing/sync`), si el estado local es `trialing` y Recurrente devuelve `active`, se preserva el estado local hasta que llegue el primer `payment.completed`.

### Por qué items inline y no `price_id`

Los campos `free_trial_interval` y `free_trial_interval_count` de Recurrente solo funcionan con items inline en el checkout. No son compatibles con referencias a `price_id`. Cuando `withTrial: true`, siempre se usan items inline.

---

## Base de datos

### Migración: `database/0010_billing_trial.sql`

```sql
-- Columnas nuevas en billing_subscriptions
ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_charge_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_payment_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS is_trial            BOOLEAN NOT NULL DEFAULT false;

-- Tabla de control de uso de prueba (una por organización)
CREATE TABLE IF NOT EXISTS billing_trial_usage (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID          NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  first_plan_id            UUID          REFERENCES billing_plans(id),
  provider_customer_id     VARCHAR(180),
  provider_subscription_id VARCHAR(180),
  trial_started_at         TIMESTAMPTZ,
  trial_ends_at            TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  canceled_at              TIMESTAMPTZ,
  status                   VARCHAR(40)   NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

La restricción `UNIQUE(organization_id)` impide en la base de datos que una organización tenga más de un registro de prueba. El INSERT en el webhook usa `ON CONFLICT DO NOTHING`.

### Aplicar migración

```bash
psql "$DIRECT_URL" -f database/0010_billing_trial.sql
```

---

## Estados de suscripción relacionados con la prueba

| Estado | Descripción |
|---|---|
| `setup_pending` | Checkout de prueba creado, usuario aún no completó tokenización |
| `trialing` | Prueba activa; tarjeta tokenizada, sin cobro hasta la fecha de fin |
| `trial_cancel_scheduled` | Usuario canceló la prueba antes de que termine; sin cobro pendiente |
| `first_payment_pending` | El período de prueba terminó pero el primer cobro falló |
| `trial_canceled` | La prueba fue cancelada o expiró sin convertirse a paga |

---

## API endpoints

### `GET /api/billing/trial-eligibility`

Verifica si la organización del usuario puede iniciar una prueba gratuita.

**Respuesta:**
```json
{
  "data": {
    "eligible": true,
    "reason": "no_trial_usage"
  }
}
```

Razones posibles: `no_trial_usage` (elegible), `already_used` (ya usó prueba).

---

### `POST /api/billing/subscribe`

Crea un checkout de suscripción. Si la organización es elegible, crea un checkout de prueba gratuita automáticamente.

**Request:** `{ "planId": "uuid-del-plan" }`

**Respuesta:**
```json
{
  "data": {
    "checkoutUrl": "https://app.recurrente.com/c/...",
    "isTrial": true
  }
}
```

---

### `GET /api/billing/subscription`

Devuelve la suscripción actual con campos de prueba incluidos.

**Respuesta (con prueba activa):**
```json
{
  "data": {
    "id": "...",
    "status": "trialing",
    "is_trial": true,
    "trial_started_at": "2026-06-29T00:00:00Z",
    "trial_ends_at": "2026-07-29T00:00:00Z",
    "first_charge_at": "2026-07-29T00:00:00Z",
    "first_payment_status": null,
    "plan": {
      "slug": "professional",
      "price_monthly_cents": 14900,
      "currency": "USD"
    }
  },
  "trial_eligible": false
}
```

---

### `POST /api/billing/cancel`

Cancela la suscripción o la prueba gratuita.

Durante una prueba activa, la cancelación establece `trial_cancel_scheduled`. El usuario conserva acceso hasta `trial_ends_at`. No se realizará ningún cobro.

---

### `POST /api/billing/change-plan`

Durante una prueba, solo registra `pending_plan_id` sin interrumpir la prueba. El cambio es efectivo al primer cobro.

**Respuesta (durante prueba):**
```json
{
  "data": {
    "isTrialPlanChange": true,
    "changeType": "upgrade",
    "effectiveAt": "2026-07-29T00:00:00Z"
  }
}
```

---

### `POST /api/billing/reactivate`

| Escenario | Estado entrada | Resultado |
|---|---|---|
| A-trial | `trial_cancel_scheduled` (dentro del período) | Revierte a `trialing` |
| A | `cancel_scheduled` (dentro del período) | Revierte a `active` |
| B | `canceled` / `trial_canceled` | Nuevo checkout de pago (sin nueva prueba) |
| C | `payment_failed` / `first_payment_pending` | Checkout de actualización de tarjeta |

---

## Webhooks de Recurrente

### `setup_intent.succeeded`

**Este es el único evento que activa una prueba.** La prueba nunca se activa desde la success URL ni desde el endpoint subscribe.

Acciones:
1. Busca el checkout en `billing_checkouts` por `provider_checkout_id` del evento.
2. Actualiza `billing_subscriptions`: `status = 'trialing'`, `trial_started_at`, `trial_ends_at`, `first_charge_at`, `is_trial = true`.
3. Inserta en `billing_trial_usage` con `ON CONFLICT DO NOTHING`.
4. Actualiza `organizations.plan_code`.

### `setup_intent.cancelled` / `setup_intent.canceled`

Tokenización fallida. Revierte el checkout a `checkout_pending`.

### `payment.completed` (primer cobro de prueba)

Detectado cuando `is_trial = true` y no hay `first_payment_status`. Transiciona `trialing → active`.

### `subscription.canceled`

Si `is_trial = true`: estado final `trial_canceled`. Si no: `canceled`.

### `payment.failed` (durante prueba)

Si `is_trial = true` y no hay `first_payment_status`: establece `first_payment_pending`.

---

## Seguridad

- `RECURRENTE_SECRET_KEY` y `RECURRENTE_WEBHOOK_SIGNING_SECRET` **nunca** se exponen al navegador.
- La activación depende **únicamente** de webhook válido y firmado (HMAC-SHA256 con Svix).
- Protección anti-replay: se rechaza cualquier evento con timestamp > 5 minutos de antigüedad.
- Los precios vienen de la base de datos, nunca del frontend.
- La tarjeta no se ingresa en LISM; Recurrente maneja el formulario de pago.
- La restricción `UNIQUE(organization_id)` en `billing_trial_usage` garantía en la capa de DB.

---

## UI/UX

### Para organizaciones elegibles (sin prueba previa)

- Las tarjetas de plan muestran badge "Primer mes GRATIS".
- El precio dice "Sin costo hoy" y "Luego $X.XX/mes".
- El botón dice "Iniciar prueba gratuita".
- El modal requiere checkbox: "Entiendo que al finalizar mi período de prueba se cobrará automáticamente…".

### Estado `trialing`

- Banner teal "PRUEBA GRATUITA" con fecha de fin y primer cobro.
- Panel de resumen muestra "Sin costo durante la prueba".
- Botón "Cancelar prueba" con advertencia: "No podrás usar otra prueba gratuita para esta organización".

### Estado `trial_cancel_scheduled`

- Banner naranja indica que la prueba está cancelada, fecha de fin y que no habrá cobro.
- Botón "Reactivar prueba".

---

## Pruebas

Archivo: `__tests__/billing/trial.test.ts`

```bash
npx vitest run __tests__/billing/trial.test.ts
```

Cubre:
- Elegibilidad de prueba (tests 1–2)
- Helpers `isSubscriptionTrialing`, `hasAccessToService` (tests 3–9)
- Mapeo de estados de Recurrente (tests 10–13)
- Configuración del checkout con `withTrial` (tests 14–16)
- Límites de plan durante prueba (tests 17–20)
- Verificación de firma de webhooks Svix (tests 21–24)
- Transiciones de estado (tests 25–26)

---

## Constantes

```typescript
// lib/billing-plans.ts
export const TRIAL_DURATION_MONTHS = 1;

export function isSubscriptionTrialing(status: BillingStatus): boolean
export function hasAccessToService(status: BillingStatus): boolean
```

---

## Checklist de despliegue

- [ ] Ejecutar migración `database/0010_billing_trial.sql` en producción
- [ ] Verificar `RECURRENTE_WEBHOOK_SIGNING_SECRET` y `RECURRENTE_SECRET_KEY` en producción
- [ ] Confirmar webhook de Recurrente configurado para enviar `setup_intent.succeeded` y `setup_intent.cancelled`
- [ ] `npx vitest run` — todos los tests pasan
- [ ] `npm run build` — sin errores TypeScript

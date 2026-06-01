# Polar billing migration — design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)
**Author:** nadav2150 + Claude

## Problem

Paddle declined to onboard the Videly AI product during merchant-of-record (MoR)
review (AI/generative products are increasingly rejected). We need a replacement
MoR provider that accepts AI products and approves quickly, then to migrate the
existing Paddle billing integration to it.

Decision: **Polar** (polar.sh). MoR, accepts AI products, mature typed
TypeScript SDK (`@polar-sh/sdk`) that maps almost 1:1 onto the current
catalog + discriminated-webhook structure.

## Scope & assumptions

- **Clean swap.** There are no live paying customers on Paddle (Paddle rejected
  the product before go-live), so there is **no data migration** — no existing
  subscriptions, customers, or transactions to carry over.
- Paddle is **fully removed**, not run side by side.
- Checkout uses **server-created Polar checkout sessions with redirect** to the
  hosted checkout page (replacing the Paddle.js inline/overlay iframe). Polar's
  embed widget is available if the in-page feel is wanted later; redirect is the
  default for simplicity and robustness.
- DB columns/tables are renamed to **provider-neutral** names so a future
  provider change does not require another rename.

## Key simplification: `external_customer_id`

Polar checkout sessions accept an `external_customer_id`. Passing the Supabase
`user.id` lets Polar auto-create/link the customer, which:

- **Eliminates the pre-mint customer step** — `app/routes/api.billing.customer.tsx`
  and `getOrCreatePaddleCustomer` are removed.
- **Removes browser-exposed price IDs** — the client no longer needs
  `VITE_PADDLE_*` price env vars; it asks our server for a checkout URL and
  redirects.

## Architecture

### Server module — `app/lib/billing/polar.ts` (replaces `paddle.ts`)

- SDK init with env-scoped credentials. `POLAR_ENV` switches `sandbox` /
  `production`; reads `POLAR_<ENV>_ACCESS_TOKEN` and `POLAR_<ENV>_WEBHOOK_SECRET`.
- `new Polar({ accessToken, server })` cached per process (same pattern as
  `getPaddle()`).
- Catalog map keyed by **Polar product id** → domain entry (same
  `SubscriptionCatalogEntry` / `CreditPackCatalogEntry` shape and grant amounts
  as today). Env vars:
  - `POLAR_<ENV>_PRODUCT_STARTER` (starter, 8,000)
  - `POLAR_<ENV>_PRODUCT_PRO` (pro, 20,000)
  - `POLAR_<ENV>_PRODUCT_STUDIO` (studio, 60,000)
  - `POLAR_<ENV>_PRODUCT_PACK_SMALL` (small, 5,000)
  - `POLAR_<ENV>_PRODUCT_PACK_MEDIUM` (medium, 25,000)
  - `POLAR_<ENV>_PRODUCT_PACK_LARGE` (large, 75,000)
- `lookupProduct(productId)` and `getCatalog()` mirror current `lookupPrice`.

### Checkout route — `app/routes/api.billing.checkout.tsx` (new)

- Auth-guarded `POST { tier, pack? }`.
- Resolves product IDs for the tier (+ optional pack) from the catalog.
- `polar.checkouts.create({ products: [...], externalCustomerId: user.id,
  metadata: { userId, planTier, packKey }, successUrl })`.
- Returns `{ url }`. Missing-product config returns a clear error naming the env
  var, matching today's behaviour.

### Client — `app/lib/billing/checkout-client.ts` (replaces `paddle-client.ts`)

- Thin helper: `POST /api/billing/checkout` then `window.location.href = url`.
- Paddle.js overlay/inline machinery, `initializePaddle`, `frameTarget`,
  `priceIdForTier/Pack`, and `VITE_PADDLE_*` reads are all removed.

### Webhook — `app/routes/api.webhooks.polar.tsx` (replaces paddle webhook)

- Read **raw** body, verify with `validateEvent(rawBody, headers, secret)` from
  `@polar-sh/sdk/webhooks` (Standard Webhooks spec).
- Dedupe via `billing_events.event_id` insert (unchanged pattern).
- Idempotent handlers keyed by ledger idempotency keys (unchanged).

Event mapping:

| Today (Paddle) | Polar | Action |
|---|---|---|
| `subscription.created` | `subscription.created` | upsert sub row, apply plan + monthly grant |
| `subscription.updated` (renewal detect) | `order.paid` with `subscription_id` (subscription cycle) | grant monthly credits on renewal |
| `subscription.updated` (status/cancel) | `subscription.updated` | mirror status / cancel-at-period-end |
| `subscription.canceled` | `subscription.canceled` / `subscription.revoked` | mark canceled |
| `transaction.completed` (credit pack) | `order.paid` with no `subscription_id` | grant credit pack |

`resolveUserId(data)` order: `metadata.userId` → `customer.external_id` →
`provider_customer_id` DB lookup.

### Cancel route — `app/routes/api.billing.cancel-subscription.tsx`

- Replace `paddle.subscriptions.cancel(id, { effectiveFrom: "next_billing_period" })`
  with `polar.subscriptions.update({ id, subscriptionUpdate: { cancelAtPeriodEnd: true } })`.
- Surrounding lookup, optimistic `cancel_at_period_end = true` mirror, and error
  handling unchanged.

### Database — one new Supabase migration

No data to preserve, so a straight rename:

- table `paddle_events` → `billing_events`
- `user_billing.paddle_customer_id` → `provider_customer_id`
- `subscriptions.paddle_subscription_id` → `provider_subscription_id`
- `subscriptions.paddle_price_id` → `provider_product_id`
- `credit_purchases.paddle_transaction_id` → `provider_order_id`
- `credit_purchases.paddle_price_id` → `provider_product_id`

All queries referencing the old column names are updated accordingly.

### Cleanup

- Remove deps `@paddle/paddle-node-sdk`, `@paddle/paddle-js`; add `@polar-sh/sdk`.
- Remove `PADDLE_*` / `VITE_PADDLE_*` from `wrangler.jsonc`, `.env`, `.dockerignore`
  references, and `Dockerfile` if present.
- Update `refund.tsx`, `terms.tsx`, `privacy.tsx` copy: merchant of record
  Paddle → Polar.
- Update screens (`pricing.tsx`, `checkout.tsx`, `PaywallModal.tsx`, `settings.tsx`,
  `backoffice.users.$id.tsx`) and `jobs.ts` / `worker.ts` references that import
  the removed Paddle modules.

## Error handling

- Webhook returns 500 on handler failure → Polar retries; dedupe row +
  idempotency keys keep retries safe (pattern unchanged from Paddle).
- Checkout route returns descriptive errors for missing product config or
  auth failure.
- PostHog identify stays fail-open (never blocks a webhook).

## Testing

Against Polar **sandbox** (separate product set + sandbox webhook secret):

1. Subscription checkout (each tier) → `subscription.created` grants plan + monthly credits.
2. Credit-pack checkout → `order.paid` (no subscription_id) grants pack credits.
3. Subscription renewal → renewal event grants the next monthly batch once.
4. Cancel → `cancel_at_period_end` mirrored, then `subscription.canceled` finalizes.
5. Duplicate webhook delivery → deduped via `billing_events`, no double grant.

## Open items to verify against Polar docs during planning

Polar's API has changed recently; confirm before locking the implementation plan:

- Exact `checkouts.create` field names (`products` array vs `productPriceId`).
- The precise renewal event and how to distinguish it (`order.paid` billing
  reason vs `subscription.updated` period advance).
- `subscriptions.update` / cancel method signature for cancel-at-period-end.
- Webhook header names expected by `validateEvent`.

## Out of scope

- No change to credit ledger logic (`credits.ts`), plan features, or pricing
  amounts.
- No data migration (no live Paddle customers exist).
- Polar embedded checkout widget (redirect only for now).

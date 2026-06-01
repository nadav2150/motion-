# Polar Billing Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Paddle merchant-of-record integration with Polar (polar.sh), which accepts AI products, with no live-customer data migration.

**Architecture:** Server-created Polar checkout sessions (redirect to hosted checkout) using `external_customer_id = Supabase user.id`, which removes the pre-mint customer step. A single signed webhook endpoint (`@polar-sh/sdk/webhooks` `validateEvent`) drives the same idempotent credits ledger. DB columns/tables renamed provider-neutral. Pure logic (catalog lookup, webhook classification) is unit-tested with a newly added vitest; I/O paths are verified against Polar sandbox.

**Tech Stack:** React Router 7 (framework mode) on Cloudflare Workers, Supabase (service role), `@polar-sh/sdk`, vitest, TypeScript.

---

## Confirmed Polar API facts (verified against polar.sh/docs on 2026-06-01)

- **SDK init:** `import { Polar } from "@polar-sh/sdk"; new Polar({ accessToken, server: "sandbox" | "production" })`
- **Checkout:** `polar.checkouts.create({ products: string[], externalCustomerId?: string, metadata?: Record<string,string|number|boolean>, successUrl?: string })` → returns `{ id, url, ... }`
- **Cancel at period end:** `polar.subscriptions.update({ id, subscriptionUpdate: { cancelAtPeriodEnd: true } })` (verify exact casing against installed SDK types — `cancelAtPeriodEnd` is the camelCase SDK input)
- **Webhook verify:** `import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks"; const event = validateEvent(rawBody, headersObject, secret)` — throws `WebhookVerificationError` on bad signature. Uses Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Returns `{ type, data }`.
- **Dedup key:** the `webhook-id` header (Standard Webhooks delivery id) — Polar payloads have no guaranteed top-level event id.
- **Order payload (`order.paid`):** `data.id`, `data.subscription_id` (null for one-time), `data.billing_reason` ∈ `purchase | subscription_create | subscription_cycle | subscription_update`, `data.customer.external_id`, `data.product_id`, `data.total_amount` (cents), `data.metadata`.
- **Subscription payload (`subscription.created|updated|canceled`):** `data.id`, `data.status`, `data.customer.external_id`, `data.product_id`, `data.current_period_start`, `data.current_period_end`, `data.cancel_at_period_end`, `data.metadata`.

## Event mapping

| Polar event | Condition | Action |
|---|---|---|
| `subscription.created` | — | upsert subscription row, apply plan + initial monthly grant (key `sub_create:<id>`) |
| `order.paid` | `subscription_id == null` | grant credit pack from `product_id` (key `purchase:<order_id>:<product_id>`) |
| `order.paid` | `subscription_id != null` and `billing_reason == "subscription_cycle"` | renewal grant (key `sub_renew:<subscription_id>:<order_id>`) |
| `order.paid` | `billing_reason == "subscription_create"` | skip (covered by `subscription.created`) |
| `subscription.updated` | — | mirror status / cancel_at_period_end / period dates; grant only handled via `order.paid` cycle |
| `subscription.canceled` | — | mark `status=canceled`, `cancel_at_period_end=true` |

## File map

- Create `vitest.config.ts`, add `test` script — test infra
- Create `supabase/migrations/20260601_polar_billing_rename.sql` — provider-neutral rename
- Create `app/lib/billing/polar.ts` (+ `app/lib/billing/polar.test.ts`) — server SDK, catalog
- Create `app/routes/api.billing.checkout.tsx` — checkout session route
- Create `app/lib/billing/checkout-client.ts` — client POST+redirect
- Create `app/routes/api.webhooks.polar.tsx` (+ `app/lib/billing/webhook-classify.ts` + `.test.ts`) — webhook handler + pure classifier
- Modify `app/routes/api.billing.cancel-subscription.tsx` — Polar cancel
- Modify `app/lib/billing/credits.ts` — `isBillingEnabled`, `UserBilling` type, column name
- Modify `app/routes/checkout.tsx` — use checkout-client
- Modify `app/routes.ts` — route wiring
- Modify `src/worker.ts` — env interface + process.env mapping
- Modify `wrangler.jsonc` — env vars
- Modify `app/routes/backoffice.users.$id.tsx` — column names + label
- Modify UI copy: `app/motionflow/screens/checkout.tsx`, `app/motionflow/PaywallModal.tsx`, `app/motionflow/screens/pricing.tsx`
- Delete `app/lib/billing/paddle.ts`, `app/lib/paddle-client.ts`, `app/routes/api.billing.customer.tsx`, `app/routes/api.webhooks.paddle.tsx`
- Modify `package.json` — swap deps

---

## Task 1: Add vitest test infrastructure

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^3`
Expected: vitest added to devDependencies, no peer-dep errors.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script**

In `package.json` `scripts`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Sanity-check the runner**

Create a temporary `app/lib/billing/_sanity.test.ts`:

```ts
import { expect, test } from "vitest";
test("vitest runs", () => { expect(1 + 1).toBe(2); });
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Remove the sanity file and commit**

```bash
rm app/lib/billing/_sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Provider-neutral database migration

**Files:**
- Create: `supabase/migrations/20260601_polar_billing_rename.sql`

> No production data exists (Paddle never went live), so a straight column/table rename is safe. Primary-key column renames keep existing constraints. RLS policies on the renamed table are recreated.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260601_polar_billing_rename.sql`:

```sql
-- Rename Paddle-specific billing identifiers to provider-neutral names as part
-- of the Paddle -> Polar migration. No data to preserve (Paddle never went
-- live), but renames keep PKs/indexes intact.

alter table user_billing    rename column paddle_customer_id     to provider_customer_id;

alter table subscriptions   rename column paddle_subscription_id to provider_subscription_id;
alter table subscriptions   rename column paddle_price_id        to provider_product_id;

alter table credit_purchases rename column paddle_transaction_id to provider_order_id;
alter table credit_purchases rename column paddle_price_id       to provider_product_id;

-- Rename the webhook idempotency table.
alter table paddle_events rename to billing_events;

-- Recreate the RLS policy under the new table name.
drop policy if exists "service_role full access on paddle_events" on billing_events;
create policy "service_role full access on billing_events"
  on billing_events for all to service_role
  using (true) with check (true);
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `polar_billing_rename`) OR `supabase db push` if the CLI is linked.
Expected: success, no errors. Verify with `list_tables` that `billing_events` exists and `user_billing.provider_customer_id` is present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601_polar_billing_rename.sql
git commit -m "feat(db): rename billing columns provider-neutral for Polar"
```

---

## Task 3: Polar server module + catalog (with unit tests)

**Files:**
- Create: `app/lib/billing/polar.ts`
- Create: `app/lib/billing/polar.test.ts`

- [ ] **Step 1: Write the failing catalog test**

Create `app/lib/billing/polar.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildCatalog, lookupProduct } from "./polar";

const ENV_KEYS = [
  "POLAR_SANDBOX_PRODUCT_PRO",
  "POLAR_SANDBOX_PRODUCT_PACK_SMALL",
];

beforeEach(() => {
  process.env.POLAR_ENV = "sandbox";
  process.env.POLAR_SANDBOX_PRODUCT_PRO = "prod_pro_123";
  process.env.POLAR_SANDBOX_PRODUCT_PACK_SMALL = "prod_pack_small_123";
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  delete process.env.POLAR_ENV;
});

test("buildCatalog maps a subscription product to its tier + grant", () => {
  const cat = buildCatalog();
  expect(cat["prod_pro_123"]).toEqual({
    kind: "subscription",
    planTier: "pro",
    monthlyGrant: 20_000,
  });
});

test("buildCatalog maps a credit pack product to its size + credits", () => {
  const cat = buildCatalog();
  expect(cat["prod_pack_small_123"]).toEqual({
    kind: "credit_pack",
    packSize: "small",
    credits: 5_000,
  });
});

test("lookupProduct returns null for unknown product id", () => {
  expect(lookupProduct("nope")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- polar.test`
Expected: FAIL — cannot import `buildCatalog`/`lookupProduct` (module/exports missing).

- [ ] **Step 3: Implement the module**

Create `app/lib/billing/polar.ts`:

```ts
// Server-side Polar SDK plus catalog lookup. POLAR_ENV switches between
// sandbox and production; the same code path serves both. The webhook handler
// uses the catalog map to turn a product_id into a plan tier or credit count
// without re-fetching the product on every event.

import { Polar } from "@polar-sh/sdk";
import type { PlanTier } from "./plan-features";

let cached: Polar | null = null;

function polarEnv(): "production" | "sandbox" {
  return (process.env.POLAR_ENV ?? "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

// Read a Polar env-scoped variable. POLAR_ENV=production picks
// POLAR_PRODUCTION_<NAME>; otherwise POLAR_SANDBOX_<NAME>.
function readPolarEnvVar(name: string): string | undefined {
  const prefix = polarEnv() === "production" ? "POLAR_PRODUCTION_" : "POLAR_SANDBOX_";
  return process.env[`${prefix}${name}`];
}

function readAccessToken(): string {
  const token = readPolarEnvVar("ACCESS_TOKEN");
  if (!token) {
    throw new Error(`POLAR_${polarEnv().toUpperCase()}_ACCESS_TOKEN must be set in .env`);
  }
  return token;
}

export function getPolar(): Polar {
  if (cached) return cached;
  cached = new Polar({ accessToken: readAccessToken(), server: polarEnv() });
  return cached;
}

export function getWebhookSecret(): string {
  const secret = readPolarEnvVar("WEBHOOK_SECRET");
  if (!secret) {
    throw new Error(
      `POLAR_${polarEnv().toUpperCase()}_WEBHOOK_SECRET must be set in .env (Polar dashboard → Webhooks → endpoint secret)`,
    );
  }
  return secret;
}

// True when Polar is configured. Gates in credits.ts short-circuit to
// "allowed" in dev environments without a Polar token.
export function isPolarConfigured(): boolean {
  return Boolean(readPolarEnvVar("ACCESS_TOKEN"));
}

// ─────────────────────────── Catalog ───────────────────────────

export type SubscriptionCatalogEntry = {
  kind: "subscription";
  planTier: PlanTier;
  monthlyGrant: number;
};
export type CreditPackCatalogEntry = {
  kind: "credit_pack";
  packSize: "small" | "medium" | "large";
  credits: number;
};
export type CatalogEntry = SubscriptionCatalogEntry | CreditPackCatalogEntry;

export function buildCatalog(): Record<string, CatalogEntry> {
  const map: Record<string, CatalogEntry> = {};
  const subs: Array<[string | undefined, PlanTier, number]> = [
    [readPolarEnvVar("PRODUCT_STARTER"), "starter", 8_000],
    [readPolarEnvVar("PRODUCT_PRO"),     "pro",     20_000],
    [readPolarEnvVar("PRODUCT_STUDIO"),  "studio",  60_000],
  ];
  for (const [id, planTier, monthlyGrant] of subs) {
    if (id) map[id] = { kind: "subscription", planTier, monthlyGrant };
  }
  const packs: Array<[string | undefined, "small" | "medium" | "large", number]> = [
    [readPolarEnvVar("PRODUCT_PACK_SMALL"),  "small",  5_000],
    [readPolarEnvVar("PRODUCT_PACK_MEDIUM"), "medium", 25_000],
    [readPolarEnvVar("PRODUCT_PACK_LARGE"),  "large",  75_000],
  ];
  for (const [id, packSize, credits] of packs) {
    if (id) map[id] = { kind: "credit_pack", packSize, credits };
  }
  return map;
}

// Catalog is rebuilt on demand (not cached) so tests can vary env between
// calls; production calls it once per webhook which is cheap.
export function lookupProduct(productId: string): CatalogEntry | null {
  return buildCatalog()[productId] ?? null;
}

// Resolve product ids for a checkout. Returns undefined when unconfigured so
// the route can return a clear error naming the env var.
export function productIdForTier(tier: "starter" | "pro" | "studio"): string | undefined {
  return readPolarEnvVar(`PRODUCT_${tier.toUpperCase()}`);
}

export function productIdForPack(size: "small" | "medium" | "large"): string | undefined {
  return readPolarEnvVar(`PRODUCT_PACK_${size.toUpperCase()}`);
}

export function productEnvVarName(name: string): string {
  return (polarEnv() === "production" ? "POLAR_PRODUCTION_" : "POLAR_SANDBOX_") + name;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- polar.test`
Expected: 3 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors (assumes `@polar-sh/sdk` installed in Task 14; if typecheck fails only on the missing module, install it now: `npm install @polar-sh/sdk` then re-run).

```bash
git add app/lib/billing/polar.ts app/lib/billing/polar.test.ts package.json package-lock.json
git commit -m "feat(billing): add Polar server module and product catalog"
```

---

## Task 4: Checkout session route

**Files:**
- Create: `app/routes/api.billing.checkout.tsx`

- [ ] **Step 1: Implement the route**

Create `app/routes/api.billing.checkout.tsx`:

```tsx
// POST /api/billing/checkout — creates a Polar checkout session for the signed
// in user and returns its hosted URL. We pass externalCustomerId = our Supabase
// user.id so Polar auto-creates/links the customer (no pre-mint step) and
// metadata carries userId/planTier/packKey for the webhook handler.

import type { Route } from "./+types/api.billing.checkout";
import { requireUserApi } from "../lib/auth";
import {
  getPolar,
  productEnvVarName,
  productIdForPack,
  productIdForTier,
} from "../lib/billing/polar";

type Body = { tier?: string; pack?: string | null };

function isTier(v: unknown): v is "starter" | "pro" | "studio" {
  return v === "starter" || v === "pro" || v === "studio";
}
function isPack(v: unknown): v is "small" | "medium" | "large" {
  return v === "small" || v === "medium" || v === "large";
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);

  const body = (await request.json().catch(() => ({}))) as Body;
  const tier = body.tier;
  if (!isTier(tier)) {
    return Response.json({ error: `Invalid tier "${tier}"` }, { status: 400, headers });
  }

  const tierProduct = productIdForTier(tier);
  if (!tierProduct) {
    return Response.json(
      { error: `No Polar product configured for tier "${tier}". Set ${productEnvVarName(`PRODUCT_${tier.toUpperCase()}`)}.` },
      { status: 500, headers },
    );
  }

  const products: string[] = [tierProduct];
  const pack = body.pack;
  if (isPack(pack)) {
    const packProduct = productIdForPack(pack);
    if (packProduct) products.push(packProduct);
    else console.warn(`[checkout] no Polar product for pack "${pack}" — continuing subscription only`);
  }

  const origin = new URL(request.url).origin;

  try {
    const checkout = await getPolar().checkouts.create({
      products,
      externalCustomerId: user.id,
      metadata: {
        userId: user.id,
        planTier: tier,
        packKey: isPack(pack) ? pack : "",
      },
      successUrl: `${origin}/home?upgraded=${tier}`,
    });
    return Response.json({ url: checkout.url }, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[checkout] Polar checkout create failed for ${user.id}: ${msg}`);
    return Response.json({ error: "Could not create checkout" }, { status: 502, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Route `+types` are generated by `react-router typegen`, which `typecheck` runs first. The route is wired in Task 9; typegen reads `routes.ts`, so if it complains about a missing `+types` module, proceed — it resolves after Task 9. If it errors now, temporarily add the route line from Task 9 first.)

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.billing.checkout.tsx
git commit -m "feat(billing): add Polar checkout session route"
```

---

## Task 5: Client checkout helper + update checkout route

**Files:**
- Create: `app/lib/billing/checkout-client.ts`
- Modify: `app/routes/checkout.tsx`

- [ ] **Step 1: Implement the client helper**

Create `app/lib/billing/checkout-client.ts`:

```ts
// Client-side checkout: ask our server for a Polar hosted-checkout URL, then
// redirect the browser to it. Replaces the Paddle.js overlay. Product ids stay
// server-side — the browser only sends the chosen tier/pack.

export type StartCheckoutArgs = {
  tier: "starter" | "pro" | "studio";
  pack?: "small" | "medium" | "large" | null;
};

export async function startCheckout(args: StartCheckoutArgs): Promise<void> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: args.tier, pack: args.pack ?? null }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Checkout failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("Checkout response missing url");
  window.location.href = url;
}
```

- [ ] **Step 2: Rewrite the checkout route handler**

In `app/routes/checkout.tsx`, replace the Paddle import block (lines ~10-15) and the `handleComplete` body. New imports:

```tsx
import { startCheckout } from "../lib/billing/checkout-client";
```

Remove the `import { openPaddleCheckout, priceEnvVarName, priceIdForPack, priceIdForTier } from "../lib/paddle-client";` line.

Replace the entire `handleComplete` function with:

```tsx
  async function handleComplete() {
    setSubmitting(true);
    try {
      await startCheckout({ tier, pack });
      // startCheckout redirects on success; nothing else runs on this page.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkout] failed to start Polar checkout:", msg);
      alert(`Could not open checkout: ${msg}`);
      setSubmitting(false);
    }
  }
```

(Note: the `finally { setSubmitting(false) }` is removed because a successful call navigates away; we only reset on error.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. No remaining references to `priceIdForTier`/`openPaddleCheckout` in `checkout.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/lib/billing/checkout-client.ts app/routes/checkout.tsx
git commit -m "feat(billing): redirect checkout via Polar session, drop Paddle.js"
```

---

## Task 6: Webhook handler + pure classifier (with unit tests)

**Files:**
- Create: `app/lib/billing/webhook-classify.ts`
- Create: `app/lib/billing/webhook-classify.test.ts`
- Create: `app/routes/api.webhooks.polar.tsx`

- [ ] **Step 1: Write the failing classifier test**

Create `app/lib/billing/webhook-classify.test.ts`:

```ts
import { expect, test } from "vitest";
import { classifyOrder, extractUserIdHint } from "./webhook-classify";

test("classifyOrder: one-time order (no subscription) is a credit pack", () => {
  expect(classifyOrder({ subscription_id: null, billing_reason: "purchase" }))
    .toBe("credit_pack");
});

test("classifyOrder: subscription cycle is a renewal", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_cycle" }))
    .toBe("renewal");
});

test("classifyOrder: subscription create is skipped (handled by subscription.created)", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_create" }))
    .toBe("skip");
});

test("classifyOrder: subscription update bill is skipped", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_update" }))
    .toBe("skip");
});

test("extractUserIdHint prefers metadata.userId, then customer.external_id", () => {
  expect(extractUserIdHint({ metadata: { userId: "u1" }, customer: { external_id: "u2" } }))
    .toBe("u1");
  expect(extractUserIdHint({ metadata: {}, customer: { external_id: "u2" } }))
    .toBe("u2");
  expect(extractUserIdHint({})).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- webhook-classify`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement the classifier**

Create `app/lib/billing/webhook-classify.ts`:

```ts
// Pure helpers for the Polar webhook handler — no I/O, unit tested.

export type OrderShape = {
  subscription_id?: string | null;
  billing_reason?: string | null;
};

export type OrderClass = "credit_pack" | "renewal" | "skip";

// Decide what an order.paid event means for the ledger.
// - no subscription_id      → one-time credit pack purchase
// - subscription_cycle      → renewal (grant the next monthly batch)
// - subscription_create/... → skip (subscription.created already granted)
export function classifyOrder(order: OrderShape): OrderClass {
  if (!order.subscription_id) return "credit_pack";
  if (order.billing_reason === "subscription_cycle") return "renewal";
  return "skip";
}

// Best-effort userId hint from a webhook payload: our metadata first, then the
// customer's external_id (which we set to the Supabase user id at checkout).
export function extractUserIdHint(data: {
  metadata?: { userId?: unknown } | null;
  customer?: { external_id?: unknown } | null;
}): string | null {
  const fromMeta = data.metadata?.userId;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const fromExternal = data.customer?.external_id;
  if (typeof fromExternal === "string" && fromExternal) return fromExternal;
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- webhook-classify`
Expected: 5 passed.

- [ ] **Step 5: Implement the webhook route**

Create `app/routes/api.webhooks.polar.tsx`:

```tsx
// POST /api/webhooks/polar — receives Standard-Webhooks-signed events from Polar.
//
// Flow:
//   1. Read RAW body (signature is over the bytes).
//   2. Verify via validateEvent(rawBody, headers, secret).
//   3. Dedupe via billing_events.event_id INSERT using the webhook-id header.
//   4. Dispatch by event.type. Each handler is idempotent on the ledger side.
//
// userId resolution: metadata.userId → customer.external_id → user_billing
// lookup by provider_customer_id.

import type { Route } from "./+types/api.webhooks.polar";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { getWebhookSecret, lookupProduct } from "../lib/billing/polar";
import { classifyOrder, extractUserIdHint } from "../lib/billing/webhook-classify";
import { getSupabase } from "../lib/supabase";
import { adjustBalance } from "../lib/billing/credits";
import { getPostHog, flushPostHog } from "../lib/posthog";
import type { PlanTier } from "../lib/billing/plan-features";

function log(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  const parts = [`[polar-webhook] ${msg}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  const line = parts.join(" ");
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const headers = Object.fromEntries(request.headers) as Record<string, string>;
  const deliveryId = headers["webhook-id"];
  if (!deliveryId) {
    log("warn", "missing webhook-id header");
    return Response.json({ error: "Missing webhook-id" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = validateEvent(rawBody, headers, getWebhookSecret());
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      log("warn", "signature verify failed");
      return Response.json({ error: "Invalid signature" }, { status: 403 });
    }
    throw err;
  }

  log("info", "received", { type: event.type, id: deliveryId });

  const db = getSupabase();
  const { error: dedupeErr } = await db
    .from("billing_events")
    .insert({ event_id: deliveryId, event_type: event.type });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      log("info", "deduped (already processed)", { id: deliveryId });
      return Response.json({ ok: true, deduped: true });
    }
    log("error", "dedupe insert failed", { id: deliveryId, error: dedupeErr.message });
    return Response.json({ error: "Dedupe failure" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "subscription.created":
        await handleSubscriptionCreated(event.data);
        break;
      case "subscription.updated":
        await handleSubscriptionUpdated(event.data);
        break;
      case "subscription.canceled":
        await handleSubscriptionCanceled(event.data);
        break;
      case "order.paid":
        await handleOrderPaid(event.data);
        break;
      default:
        log("info", "unhandled (recorded for audit)", { type: event.type, id: deliveryId });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "dispatch failed", { type: event.type, id: deliveryId, error: msg });
    return Response.json({ error: "Dispatch failed" }, { status: 500 });
  }

  void flushPostHog();
  return Response.json({ ok: true });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

// ───────── Helpers ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

async function resolveUserId(data: AnyData): Promise<string | null> {
  const hint = extractUserIdHint(data);
  if (hint) return hint;
  const customerId = data.customer_id ?? data.customer?.id;
  if (typeof customerId === "string" && customerId) {
    const db = getSupabase();
    const { data: row } = await db
      .from("user_billing")
      .select("user_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  return null;
}

async function handleSubscriptionCreated(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "subscription.created without resolvable userId", { sub: subscriptionId });
    return;
  }
  const productId = data.product_id as string | undefined;
  const entry = productId ? lookupProduct(productId) : null;
  if (!entry || entry.kind !== "subscription") {
    log("warn", "unknown subscription product (skipping)", { sub: subscriptionId, product_id: productId });
    return;
  }

  const status = (data.status as string) ?? "active";
  const periodStart = (data.current_period_start as string) ?? null;
  const periodEnd = (data.current_period_end as string) ?? null;

  const db = getSupabase();
  await db.from("subscriptions").upsert(
    {
      provider_subscription_id: subscriptionId,
      user_id: userId,
      provider_product_id: productId!,
      plan_tier: entry.planTier,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    },
    { onConflict: "provider_subscription_id" },
  );

  // Persist the customer id so future events without metadata still resolve.
  const customerId = data.customer_id ?? data.customer?.id ?? null;
  if (customerId) {
    await db.from("user_billing").update({ provider_customer_id: customerId }).eq("user_id", userId);
  }

  await applyPlanAndGrant(userId, entry.planTier, entry.monthlyGrant, periodEnd, `sub_create:${subscriptionId}`);
  identifyPlan(userId, {
    plan_tier: entry.planTier,
    monthly_grant: entry.monthlyGrant,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    current_period_end: periodEnd,
  });
  log("info", "subscription.created applied", { sub: subscriptionId, user_id: userId, plan_tier: entry.planTier });
}

async function handleSubscriptionUpdated(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
  const status = (data.status as string) ?? "active";
  const periodStart = (data.current_period_start as string) ?? null;
  const periodEnd = (data.current_period_end as string) ?? null;
  const cancelFlag = Boolean(data.cancel_at_period_end);

  const db = getSupabase();
  const { data: current } = await db
    .from("subscriptions")
    .select("user_id, plan_tier")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelFlag,
  }).eq("provider_subscription_id", subscriptionId);

  if (!current) {
    log("info", "subscription.updated for untracked sub", { sub: subscriptionId, status });
    return;
  }
  identifyPlan(current.user_id as string, {
    plan_tier: current.plan_tier,
    provider_subscription_id: subscriptionId,
    subscription_status: status,
    cancel_at_period_end: cancelFlag,
    current_period_end: periodEnd,
  });
  log("info", "subscription.updated mirrored", { sub: subscriptionId, status, cancel_at_period_end: cancelFlag });
}

async function handleSubscriptionCanceled(data: AnyData): Promise<void> {
  const subscriptionId = data.id as string;
  const db = getSupabase();
  const { data: row } = await db
    .from("subscriptions")
    .select("user_id, plan_tier")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  await db.from("subscriptions").update({
    status: "canceled",
    cancel_at_period_end: true,
  }).eq("provider_subscription_id", subscriptionId);

  if (row?.user_id) {
    identifyPlan(row.user_id as string, {
      plan_tier: row.plan_tier,
      provider_subscription_id: subscriptionId,
      subscription_status: "canceled",
      cancel_at_period_end: true,
    });
  }
  log("info", "subscription.canceled applied", { sub: subscriptionId, user_id: row?.user_id ?? null });
}

async function handleOrderPaid(data: AnyData): Promise<void> {
  const orderId = data.id as string;
  const cls = classifyOrder({ subscription_id: data.subscription_id, billing_reason: data.billing_reason });

  if (cls === "skip") {
    log("info", "order.paid skipped (subscription bill handled elsewhere)", { order: orderId, reason: data.billing_reason });
    return;
  }

  const userId = await resolveUserId(data);
  if (!userId) {
    log("warn", "order.paid without resolvable userId", { order: orderId });
    return;
  }
  const db = getSupabase();

  if (cls === "renewal") {
    const subscriptionId = data.subscription_id as string;
    const { data: sub } = await db
      .from("subscriptions")
      .select("provider_product_id")
      .eq("provider_subscription_id", subscriptionId)
      .maybeSingle();
    const productId = (sub?.provider_product_id ?? data.product_id) as string | undefined;
    const entry = productId ? lookupProduct(productId) : null;
    if (!entry || entry.kind !== "subscription") {
      log("warn", "renewal skipped — product not in catalog", { order: orderId, product_id: productId });
      return;
    }
    const periodEnd = (data.current_period_end as string) ?? null;
    await applyPlanAndGrant(userId, entry.planTier, entry.monthlyGrant, periodEnd, `sub_renew:${subscriptionId}:${orderId}`);
    log("info", "order.paid renewal granted", { order: orderId, user_id: userId, plan_tier: entry.planTier });
    return;
  }

  // credit_pack
  const productId = data.product_id as string | undefined;
  const entry = productId ? lookupProduct(productId) : null;
  if (!entry || entry.kind !== "credit_pack") {
    log("info", "order.paid one-time but product not a credit pack (skipping)", { order: orderId, product_id: productId });
    return;
  }
  const amountCents = Number(data.total_amount ?? 0);
  await db.from("credit_purchases").upsert(
    {
      provider_order_id: orderId,
      user_id: userId,
      provider_product_id: productId!,
      credits_granted: entry.credits,
      amount_usd_cents: amountCents,
      status: "completed",
    },
    { onConflict: "provider_order_id" },
  );
  await adjustBalance({
    userId,
    amount: entry.credits,
    kind: "purchase",
    reason: `credit_pack:${entry.packSize}`,
    idempotencyKey: `purchase:${orderId}:${productId}`,
  });
  identifyPlan(userId, {
    last_credit_purchase_order: orderId,
    last_credit_purchase_at: new Date().toISOString(),
  });
  log("info", "order.paid credit pack granted", { order: orderId, user_id: userId, credits: entry.credits });
}

async function applyPlanAndGrant(
  userId: string,
  planTier: PlanTier,
  monthlyGrant: number,
  periodEnd: string | null,
  idempotencyKey: string,
): Promise<void> {
  const db = getSupabase();
  await db.from("user_billing").update({
    plan_tier: planTier,
    monthly_grant: monthlyGrant,
    period_end: periodEnd,
  }).eq("user_id", userId);
  await adjustBalance({
    userId,
    amount: monthlyGrant,
    kind: "grant",
    reason: `monthly_grant:${planTier}`,
    idempotencyKey,
  });
  log("info", "plan applied + monthly grant", { user_id: userId, plan_tier: planTier, monthly_grant: monthlyGrant });
}

function identifyPlan(userId: string, properties: Record<string, unknown>): void {
  try {
    getPostHog().identify({ distinctId: userId, properties });
  } catch (err) {
    log("warn", "posthog identify failed (non-fatal)", { user_id: userId, error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `+types/api.webhooks.polar` is missing, add the route line from Task 9 first.)

- [ ] **Step 7: Commit**

```bash
git add app/lib/billing/webhook-classify.ts app/lib/billing/webhook-classify.test.ts app/routes/api.webhooks.polar.tsx
git commit -m "feat(billing): add Polar webhook handler and classifier"
```

---

## Task 7: Swap the cancel-subscription route to Polar

**Files:**
- Modify: `app/routes/api.billing.cancel-subscription.tsx`

- [ ] **Step 1: Update imports and column names**

In `app/routes/api.billing.cancel-subscription.tsx`:
- Change `import { getPaddle } from "../lib/billing/paddle";` → `import { getPolar } from "../lib/billing/polar";`
- In the `.select(...)`, change `paddle_subscription_id` → `provider_subscription_id`.

- [ ] **Step 2: Replace the cancel call**

Replace the `const paddle = getPaddle();` try/catch block with:

```tsx
  const polar = getPolar();
  try {
    await polar.subscriptions.update({
      id: sub.provider_subscription_id as string,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing] polar cancel failed for ${user.id} sub=${sub.provider_subscription_id}: ${msg}`);
    return Response.json({ error: "Polar cancel failed" }, { status: 502, headers });
  }
```

Then update the final `.update({ cancel_at_period_end: true }).eq("paddle_subscription_id", ...)` to `.eq("provider_subscription_id", sub.provider_subscription_id)`.

> Verify `cancelAtPeriodEnd` casing against the installed `@polar-sh/sdk` types (`SubscriptionUpdate`/`SubscriptionCancel`). If the SDK uses `cancel_at_period_end`, use that instead.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors; no remaining `paddle` references in this file.

- [ ] **Step 4: Commit**

```bash
git add app/routes/api.billing.cancel-subscription.tsx
git commit -m "feat(billing): cancel subscriptions via Polar"
```

---

## Task 8: Update credits.ts gate and types

**Files:**
- Modify: `app/lib/billing/credits.ts`

- [ ] **Step 1: Update the billing-enabled gate**

In `app/lib/billing/credits.ts`:
- Add import near the top: `import { isPolarConfigured } from "./polar";`
- Replace the body of `isBillingEnabled`:

```ts
export function isBillingEnabled(): boolean {
  return isPolarConfigured();
}
```

- Update the comment above it that says "when PADDLE_API_KEY is set" → "when a Polar access token is set".

- [ ] **Step 2: Rename the UserBilling field**

In the `UserBilling` type, change `paddle_customer_id: string | null;` → `provider_customer_id: string | null;`.
Then search this file for any other `paddle_customer_id` usage (e.g. in `getOrCreateBilling` select/insert) and rename to `provider_customer_id`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Consumers of `paddle_customer_id` are updated in Tasks 9/12; if typecheck flags them now, proceed to those tasks before final verification.)

- [ ] **Step 4: Commit**

```bash
git add app/lib/billing/credits.ts
git commit -m "refactor(billing): gate on Polar config, rename customer id field"
```

---

## Task 9: Route wiring

**Files:**
- Modify: `app/routes.ts`

- [ ] **Step 1: Replace the billing routes block**

In `app/routes.ts`, replace these three lines:

```tsx
  route("api/billing/customer", "routes/api.billing.customer.tsx"),
  route("api/billing/cancel-subscription", "routes/api.billing.cancel-subscription.tsx"),
  route("api/webhooks/paddle", "routes/api.webhooks.paddle.tsx"),
```

with:

```tsx
  route("api/billing/checkout", "routes/api.billing.checkout.tsx"),
  route("api/billing/cancel-subscription", "routes/api.billing.cancel-subscription.tsx"),
  route("api/webhooks/polar", "routes/api.webhooks.polar.tsx"),
```

- [ ] **Step 2: Regenerate types and typecheck**

Run: `npm run typecheck`
Expected: no errors related to route types. The old `api.billing.customer` / `api.webhooks.paddle` route files are deleted in Task 14.

- [ ] **Step 3: Commit**

```bash
git add app/routes.ts
git commit -m "feat(billing): wire Polar checkout + webhook routes"
```

---

## Task 10: Worker env interface

**Files:**
- Modify: `src/worker.ts:34-42` and `:87-95`

- [ ] **Step 1: Replace the env interface fields**

In `src/worker.ts`, replace the Paddle env declarations (the `PADDLE_ENV` + `PADDLE_LIVE_*` block around lines 34-42) with:

```ts
  POLAR_ENV: string;
  POLAR_PRODUCTION_ACCESS_TOKEN: string;
  POLAR_PRODUCTION_WEBHOOK_SECRET: string;
  POLAR_PRODUCTION_PRODUCT_STARTER: string;
  POLAR_PRODUCTION_PRODUCT_PRO: string;
  POLAR_PRODUCTION_PRODUCT_STUDIO: string;
  POLAR_PRODUCTION_PRODUCT_PACK_SMALL: string;
  POLAR_PRODUCTION_PRODUCT_PACK_MEDIUM: string;
  POLAR_PRODUCTION_PRODUCT_PACK_LARGE: string;
```

- [ ] **Step 2: Replace the process.env mapping**

Replace the matching `PADDLE_*: this.env.PADDLE_*` block (around lines 87-95) with:

```ts
    POLAR_ENV: this.env.POLAR_ENV,
    POLAR_PRODUCTION_ACCESS_TOKEN: this.env.POLAR_PRODUCTION_ACCESS_TOKEN,
    POLAR_PRODUCTION_WEBHOOK_SECRET: this.env.POLAR_PRODUCTION_WEBHOOK_SECRET,
    POLAR_PRODUCTION_PRODUCT_STARTER: this.env.POLAR_PRODUCTION_PRODUCT_STARTER,
    POLAR_PRODUCTION_PRODUCT_PRO: this.env.POLAR_PRODUCTION_PRODUCT_PRO,
    POLAR_PRODUCTION_PRODUCT_STUDIO: this.env.POLAR_PRODUCTION_PRODUCT_STUDIO,
    POLAR_PRODUCTION_PRODUCT_PACK_SMALL: this.env.POLAR_PRODUCTION_PRODUCT_PACK_SMALL,
    POLAR_PRODUCTION_PRODUCT_PACK_MEDIUM: this.env.POLAR_PRODUCTION_PRODUCT_PACK_MEDIUM,
    POLAR_PRODUCTION_PRODUCT_PACK_LARGE: this.env.POLAR_PRODUCTION_PRODUCT_PACK_LARGE,
```

> Production uses `POLAR_ENV=production`, so only the `POLAR_PRODUCTION_*` vars are wired here, mirroring how the old code only wired `PADDLE_LIVE_*`. Sandbox values live in `.env` for local dev.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/worker.ts
git commit -m "feat(billing): wire Polar production env into worker"
```

---

## Task 11: wrangler.jsonc + .env vars

**Files:**
- Modify: `wrangler.jsonc:24-31`
- Modify: `.env` (local, not committed) and `.dev.vars` if present

- [ ] **Step 1: Replace the VITE_PADDLE vars block**

In `wrangler.jsonc`, remove the `VITE_PADDLE_*` block (lines ~24-31). The client no longer needs product ids (they're server-side now). Add the non-secret Polar pointer:

```jsonc
        "POLAR_ENV": "production",
```

> Secrets (`POLAR_PRODUCTION_ACCESS_TOKEN`, `POLAR_PRODUCTION_WEBHOOK_SECRET`) and product ids must NOT be hardcoded in `wrangler.jsonc`. Set them as Wrangler secrets:
> `wrangler secret put POLAR_PRODUCTION_ACCESS_TOKEN` (repeat for WEBHOOK_SECRET and each PRODUCT_*).

- [ ] **Step 2: Update local .env**

Add to `.env` (create the Polar sandbox products in the Polar dashboard first):

```
POLAR_ENV=sandbox
POLAR_SANDBOX_ACCESS_TOKEN=polar_oat_...
POLAR_SANDBOX_WEBHOOK_SECRET=...
POLAR_SANDBOX_PRODUCT_STARTER=...
POLAR_SANDBOX_PRODUCT_PRO=...
POLAR_SANDBOX_PRODUCT_STUDIO=...
POLAR_SANDBOX_PRODUCT_PACK_SMALL=...
POLAR_SANDBOX_PRODUCT_PACK_MEDIUM=...
POLAR_SANDBOX_PRODUCT_PACK_LARGE=...
```

Remove all `PADDLE_*` / `VITE_PADDLE_*` lines from `.env`.

- [ ] **Step 3: Commit (wrangler.jsonc only; .env is gitignored)**

```bash
git add wrangler.jsonc
git commit -m "chore(billing): replace Paddle env with Polar in wrangler config"
```

---

## Task 12: Backoffice user detail page

**Files:**
- Modify: `app/routes/backoffice.users.$id.tsx`

- [ ] **Step 1: Rename type fields and DB selects**

In `app/routes/backoffice.users.$id.tsx`:
- In the loader type and any `.select(...)`: `paddle_customer_id` → `provider_customer_id`, `paddle_subscription_id` → `provider_subscription_id`.
- Update the JSX: `<Row k="Paddle customer" v={b.provider_customer_id ?? "—"} />` and the `key={s.provider_subscription_id}` and the `<div key={s.provider_subscription_id} ...>`.
- Change the label text "Paddle customer" → "Polar customer".

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add app/routes/backoffice.users.$id.tsx
git commit -m "chore(backoffice): rename billing fields to provider-neutral"
```

---

## Task 13: UI copy — Paddle → Polar

**Files:**
- Modify: `app/motionflow/screens/checkout.tsx` (lines ~402, 571, 635, and the comment block ~43-124)
- Modify: `app/motionflow/PaywallModal.tsx` (lines ~14, 506)
- Modify: `app/motionflow/screens/pricing.tsx` (comment line ~24)

- [ ] **Step 1: Replace user-visible "Paddle" strings**

In `app/motionflow/screens/checkout.tsx`:
- `"Payment details are collected securely by Paddle once you continue."` → `"...securely by Polar once you continue."`
- `"Local sales tax and any promo codes are applied at the secure Paddle checkout based on your billing location."` → `"...at the secure Polar checkout..."`
- `"Secured by Paddle · SSL encrypted"` → `"Secured by Polar · SSL encrypted"`

In `app/motionflow/PaywallModal.tsx`:
- Line ~506 `"Secure payment · Paddle"` → `"Secure payment · Polar"`.

- [ ] **Step 2: Update stale code comments referencing Paddle**

Update the comments in `checkout.tsx` (~43-44, 82, 121-124), `PaywallModal.tsx` (~14), and `pricing.tsx` (~24) that mention Paddle / `VITE_PADDLE_PRICE_*` / `paddle.ts` so they reference Polar product ids and `app/lib/billing/polar.ts`. These are comments only — keep the surrounding logic unchanged.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add app/motionflow/screens/checkout.tsx app/motionflow/PaywallModal.tsx app/motionflow/screens/pricing.tsx
git commit -m "chore(ui): update billing copy from Paddle to Polar"
```

---

## Task 14: Remove Paddle, install Polar, final build

**Files:**
- Delete: `app/lib/billing/paddle.ts`, `app/lib/paddle-client.ts`, `app/routes/api.billing.customer.tsx`, `app/routes/api.webhooks.paddle.tsx`
- Modify: `package.json` (deps)

- [ ] **Step 1: Confirm nothing imports the deleted modules**

Run: `git grep -n "paddle-client\|billing/paddle\|api.billing.customer\|getOrCreatePaddleCustomer\|openPaddleCheckout" -- app src`
Expected: no results. If any appear, fix them before deleting.

- [ ] **Step 2: Delete the Paddle files**

```bash
git rm app/lib/billing/paddle.ts app/lib/paddle-client.ts app/routes/api.billing.customer.tsx app/routes/api.webhooks.paddle.tsx
```

- [ ] **Step 3: Swap dependencies**

```bash
npm uninstall @paddle/paddle-js @paddle/paddle-node-sdk
npm install @polar-sh/sdk
```

- [ ] **Step 4: Confirm no remaining Paddle references**

Run: `git grep -ni "paddle" -- app src wrangler.jsonc package.json`
Expected: no results (or only intentional ones you accept). Fix any stragglers.

- [ ] **Step 5: Full verification**

Run: `npm test`
Expected: all tests pass (polar.test, webhook-classify.test).

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(billing): remove Paddle, install @polar-sh/sdk"
```

---

## Task 15: Polar sandbox end-to-end verification

> Manual verification against Polar sandbox — there is no automated integration test for the network paths. Requires sandbox products created and `.env` filled (Task 11) plus a tunnel so Polar can reach the local webhook (the repo already has `npm run dev` with a tunnel).

- [ ] **Step 1: Start the app with the tunnel**

Run: `npm run dev`
Expected: app + tunnel up; note the public tunnel URL.

- [ ] **Step 2: Configure the Polar sandbox webhook**

In the Polar sandbox dashboard → Webhooks, add endpoint `https://<tunnel>/api/webhooks/polar`, subscribe to `subscription.created`, `subscription.updated`, `subscription.canceled`, `order.paid`. Copy the signing secret into `POLAR_SANDBOX_WEBHOOK_SECRET` and restart.

- [ ] **Step 3: Subscription checkout**

Sign in, go to `/checkout?plan=pro`, complete payment with a Polar sandbox test card.
Expected: redirect to `/home?upgraded=pro`; `subscription.created` logged; `user_billing.plan_tier=pro`, `monthly_grant=20000`; a `grant` ledger row of +20000; a `subscriptions` row with `provider_subscription_id`.

- [ ] **Step 4: Credit-pack checkout**

Go to `/checkout?plan=pro&pack=small` (or trigger a one-time pack), complete payment.
Expected: `order.paid` with no subscription cycle grants +5000 `purchase` ledger row; `credit_purchases` row with `provider_order_id`.

- [ ] **Step 5: Duplicate delivery / idempotency**

In the Polar dashboard, resend the last `order.paid` delivery.
Expected: webhook logs `deduped (already processed)`; no second ledger row (balance unchanged).

- [ ] **Step 6: Cancel**

Call cancel from settings (POST `/api/billing/cancel-subscription`).
Expected: 200; `subscriptions.cancel_at_period_end=true`; later `subscription.canceled`/`updated` sets `status=canceled`.

- [ ] **Step 7: Renewal (optional / accelerated)**

If sandbox supports forcing a renewal, trigger one; otherwise verify the `order.paid` + `billing_reason=subscription_cycle` path by replaying a captured cycle order.
Expected: exactly one additional monthly grant keyed `sub_renew:<sub>:<order>`.

- [ ] **Step 8: Record results**

Note pass/fail per step in the PR description. Do not claim the migration complete until Steps 3–6 pass.

---

## Self-review notes

- **Spec coverage:** server module (T3), checkout redirect (T4/T5), webhook + event mapping (T6), cancel (T7), DB rename (T2), env (T10/T11), cleanup + deps (T13/T14), testing (T1 unit + T15 sandbox) — all spec sections covered.
- **`external_customer_id`:** used in T4; webhook resolves via `customer.external_id` in T6 — consistent.
- **Renewal double-grant avoided:** `order.paid` with `subscription_create`/`subscription_update` is skipped (T6 classifier), initial grant only from `subscription.created`.
- **Naming consistency:** `provider_customer_id` / `provider_subscription_id` / `provider_product_id` / `provider_order_id` / `billing_events` used identically across T2, T6, T7, T8, T12.
- **SDK casing caveats:** `cancelAtPeriodEnd` (T7) and webhook payload field names flagged to verify against installed SDK types during implementation.

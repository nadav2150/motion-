# Dodo Payments setup

Videly can sell through Dodo Payments instead of Polar. The switch is one var:
`BILLING_PROVIDER=dodo` (unset or anything else = Polar, the old behavior).
Both webhook routes stay mounted, so existing Polar subscribers keep renewing
and getting credits after the switch. Cancel always goes to the provider that
owns the subscription (Dodo ids start with `sub_`).

Code: `app/lib/billing/dodo.ts`, `app/lib/billing/provider.ts`,
`app/routes/api.webhooks.dodo.tsx`, and the Dodo branch in
`app/routes/api.billing.checkout.tsx`.

## 1. Products (Dodo dashboard → Products → Add Product)

Create each in **Test Mode** first. Tax category: SaaS. Currency: USD.

| Env var suffix        | Name                   | Type                    | Price   |
|-----------------------|------------------------|-------------------------|---------|
| `PRODUCT_STARTER`     | Videly Starter         | Subscription, monthly   | $19     |
| `PRODUCT_PRO`         | Videly Pro             | Subscription, monthly   | $49     |
| `PRODUCT_STUDIO`      | Videly Studio          | Subscription, monthly   | $149    |
| `PRODUCT_PACK_SMALL`  | 5,000 credits          | One-time                | $13     |
| `PRODUCT_PACK_MEDIUM` | 25,000 credits         | One-time                | $59     |
| `PRODUCT_PACK_LARGE`  | 75,000 credits         | One-time                | $159    |

Credit amounts live in code (`buildDodoCatalog`), not in Dodo — don't attach
Dodo credit entitlements. After verification, use **Import from Test** on the
Live Mode products page and set the `DODO_LIVE_*` ids.

## 2. Webhook (Developer → Webhooks → Add endpoint)

- URL: `https://videly.io/api/webhooks/dodo`
- Events: `subscription.active`, `subscription.renewed`, `subscription.updated`,
  `subscription.plan_changed`, `subscription.cancelled`, `subscription.on_hold`,
  `subscription.past_due`, `subscription.expired`, `subscription.failed`,
  `payment.succeeded` (or simply all events — unknown ones are recorded and ignored).
- Copy the endpoint's signing secret (`whsec_…`).

Test Mode and Live Mode each need their own endpoint and secret.

## 3. Secrets

```sh
npx wrangler secret put DODO_TEST_API_KEY          # Developer → API Keys (Test Mode)
npx wrangler secret put DODO_TEST_WEBHOOK_SECRET   # whsec_… from step 2
npx wrangler secret put DODO_TEST_PRODUCT_STARTER  # pdt_…  (repeat for PRO, STUDIO,
                                                   #  PACK_SMALL, PACK_MEDIUM, PACK_LARGE)
npx wrangler secret put DODO_ENV                   # test_mode, later live_mode
npx wrangler secret put BILLING_PROVIDER           # dodo  ← this is the switch
```

Live Mode uses the same names with `DODO_LIVE_` instead of `DODO_TEST_`. For
local dev put the same keys in `.env`.

## 4. Test Mode check

1. Deploy, set `DODO_ENV=test_mode` + `BILLING_PROVIDER=dodo`.
2. On /pricing buy Starter plus a small pack with Dodo's test card `4242 4242 4242 4242`, exp 06/32, CVV 123.
3. Worker logs should show `[dodo-webhook] subscription.active applied` and
   `payment.succeeded credit pack granted`; the user's balance should rise by
   8,000 + 5,000.
4. Cancel from /settings → Dodo shows "cancels at next billing date".

## 5. Go live

Dodo only allows live payments after verification (dashboard → Verification):
account type → Product Information Form → identity (Persona: government ID +
selfie) → payout bank details. Reviews take 1–3 business days; payouts also
need a compliance review.

Reviewers compare the form to videly.io, which already has public pricing,
/terms, /privacy, /refund and support@videly.io; those pages name Dodo Payments
as merchant of record (deploy this branch before submitting).

Suggested Product Information Form answers (must match the site):

| Field | Answer |
|---|---|
| Website | https://videly.io |
| Description | Videly turns a script or idea into a finished AI-generated motion video (storyboard, visuals, voiceover) in the browser. |
| Category | SaaS |
| Delivery | Instant access; monthly subscriptions plus one-time credit packs |
| Automation | Fully automated |
| Compliance-sensitive | None (AI-generated video content; no regulated goods) |
| Integration | Checkout Sessions API + webhooks |
| Pricing | Starter $19/mo, Pro $49/mo, Studio $149/mo; packs $13 / $59 / $159 |

Then, in Live Mode:

1. Products → **Import from Test** (copies all six products) and note the new `pdt_…` ids.
2. Developer → Webhooks → add `https://videly.io/api/webhooks/dodo` again (Live has its own secret).
3. Developer → API Keys → create a Live key.
4. Secrets: `DODO_LIVE_API_KEY`, `DODO_LIVE_WEBHOOK_SECRET`, the six `DODO_LIVE_PRODUCT_*`, then
   `DODO_ENV=live_mode` (keep `BILLING_PROVIDER=dodo`).
5. Buy the cheapest item (5,000-credit pack, $13) with a real card, confirm the credits land, refund it.

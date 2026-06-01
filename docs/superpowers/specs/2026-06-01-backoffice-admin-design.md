# Backoffice admin panel — design

**Date:** 2026-06-01
**Status:** Approved, implementing

## Goal

A `backoffice.videly.io` admin panel where an admin can:
1. See all users (searchable, paginated) with identity, billing, usage, and credit ledger.
2. Impersonate a user — full session takeover with a banner and one-click return to admin.

## Decisions

- **Admin gating:** env email allowlist (`ADMIN_EMAILS`, comma-separated Worker secret). No roles/schema. Empty/unset ⇒ deny everyone.
- **Deployment:** same Worker + container. Add `backoffice.videly.io` as a `custom_domain` route. `/backoffice/*` and `/impersonate/*` routes are gated by admin email and work on any host (the subdomain is the entry URL).
- **Impersonation:** full session takeover via a signed one-time handoff token (HMAC-SHA256, short expiry). No audit logging.
- **List data:** identity + billing + usage + credit ledger.

## Architecture

Same single Cloudflare container serving the React Router 7 app. Auth stays in host-only cookies (`mf_at`/`mf_rt`). Two new server-side concerns:

### 1. Admin gating — `app/lib/admin.ts`
- `isAdmin(email)` parses `ADMIN_EMAILS`.
- `requireAdminOrRedirect(request)` (pages) / `requireAdminApi(request)` (actions), built on `getUserWithRefresh`.

### 2. Read path — two `service_role`-only Postgres RPCs (no data tables)
- `admin_list_users(search, limit, offset)` — joins `auth.users` + `user_billing` + aggregated `jobs`. Returns `total_count` for pagination.
- `admin_get_user(user_id)` — JSON bundle: identity, billing, subscriptions, usage, recent jobs, recent `credit_ledger`.

Both run as `service_role` (which can read `auth.users`); `EXECUTE` revoked from public/anon/authenticated and granted only to `service_role`, mirroring `reserve_credits`/`adjust_credits`.

### 3. Impersonation transport — signed handoff token
`app/lib/impersonation.ts`: `signHandoff`/`verifyHandoff` (HMAC-SHA256 over base64url JSON, `exp` enforced, `timingSafeEqual`). Secret = `IMPERSONATION_SECRET`.

Payload carries the impersonated session tokens **and the admin's own refresh token** so the admin can be restored on `/impersonate/stop` regardless of host topology (works in prod across subdomains and in single-host local dev).

### 4. Routes
- `GET /backoffice` — user table + search + pagination.
- `GET /backoffice/users/:id` — detail + Impersonate button.
- `POST /api/backoffice/impersonate` — `requireAdminApi`; mint target session (Supabase admin `generateLink` magiclink → `verifyOtp`); build handoff token; return an auto-submitting POST form to `<app-origin>/impersonate/start`.
- `POST /impersonate/start` — verify token; set `mf_at`/`mf_rt` = target, `mf_admin_rt` = admin refresh, `mf_imp`/`mf_imp_by` = banner info; redirect `/home`.
- `POST /impersonate/stop` — restore admin session from `mf_admin_rt`; clear impersonation cookies; redirect `/backoffice`.

App/backoffice origins are derived from the request host (`backoffice.` prefix add/strip), so no extra env config and dev works on a single localhost origin.

### 5. Banner
Root loader detects `mf_imp`; when present, App renders a fixed banner ("Impersonating <email> — Return to admin") with a form POSTing to `/impersonate/stop`.

## Security notes
- Handoff token is short-lived (60s) and HMAC-signed; delivered via POST form (not URL) to keep it out of history/referrer/logs.
- RPCs are `service_role`-only; the `auth` schema is never exposed to PostgREST.
- `ADMIN_EMAILS` and `IMPERSONATION_SECRET` are Worker secrets, forwarded into the container in `src/worker.ts`.

## Error handling
- Non-admin → redirect `/signin` (pages) / 403 JSON (actions).
- Expired/invalid handoff token → error response.
- Missing `ADMIN_EMAILS` → deny all.

## Testing
- `scripts/verify-impersonation-token.ts` — token sign/verify round-trip, tamper rejection, expiry rejection, `isAdmin` parsing. (Repo has no test runner; follows the existing standalone `scripts/verify-*.ts` convention.)
- Impersonation end-to-end verified manually.

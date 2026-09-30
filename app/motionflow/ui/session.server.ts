// Loader helper for the signed-in v2 pages: requires a session (302 to
// /signin?next=… otherwise) and resolves the plan/credits for the shell.
//
// Dev-only mock bypass: with `?mock=1` on the URL or the `videly_mock=1`
// cookie (set by api.ts when mock mode is on), the dev server skips auth and
// returns a fake user so every screen can be screenshotted without a
// database. `import.meta.env.DEV` is false in production builds.

import { parseCookies, requireUserOrRedirect } from "../../lib/auth";
import { loadCreditsForUI } from "../../lib/billing/loader";

export type AppUser = { id: string; name: string | null; email: string | null };

export type AppContext = {
  user: AppUser;
  planTier: string | null;
  credits: number | null;
  mock: boolean;
};

export const MOCK_USER: AppUser = { id: "mock-user", name: "Maya Levi", email: "maya@example.com" };

export function isMockRequest(request: Request): boolean {
  if (!import.meta.env.DEV) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("mock") === "1") return true;
  if (url.searchParams.get("mock") === "0") return false;
  return parseCookies(request.headers.get("cookie")).videly_mock === "1";
}

export async function loadAppContext(request: Request): Promise<{ ctx: AppContext; headers: Headers }> {
  if (isMockRequest(request)) {
    return {
      ctx: { user: MOCK_USER, planTier: "pro", credits: 12_400, mock: true },
      headers: new Headers(),
    };
  }
  const { user, headers } = await requireUserOrRedirect(request);
  const { credits, planTier } = await loadCreditsForUI(user.id);
  return {
    ctx: { user: { id: user.id, name: user.name, email: user.email }, planTier, credits, mock: false },
    headers,
  };
}

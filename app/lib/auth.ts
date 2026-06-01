import { createAuthSupabaseClient, getSupabase } from "./supabase";

export const ACCESS_COOKIE = "mf_at";
export const REFRESH_COOKIE = "mf_rt";

const ONE_HOUR = 60 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AuthError";
  }
}

export function sessionCookieAttrs(maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function setSessionCookies(headers: Headers, session: Session): void {
  const accessTtl = Math.min(Math.max(session.expires_in || ONE_HOUR, 60), ONE_HOUR);
  headers.append(
    "Set-Cookie",
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; ${sessionCookieAttrs(accessTtl)}`,
  );
  headers.append(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; ${sessionCookieAttrs(THIRTY_DAYS)}`,
  );
}

export function clearSessionCookies(headers: Headers): void {
  headers.append(
    "Set-Cookie",
    `${ACCESS_COOKIE}=; ${sessionCookieAttrs(0)}`,
  );
  headers.append(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; ${sessionCookieAttrs(0)}`,
  );
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<Session> {
  if (!email?.trim() || !password) {
    throw new AuthError("Email and password are required");
  }
  // Fresh client — see createAuthSupabaseClient comment for why this can't
  // share the cached client.
  const supabase = createAuthSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.session) {
    throw new AuthError(error?.message ?? "Invalid email or password", 400);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in ?? ONE_HOUR,
  };
}

export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<void> {
  const trimmedEmail = email?.trim();
  if (!trimmedEmail) throw new AuthError("Email is required");
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo,
  });
  if (error) {
    throw new AuthError(error.message, 400);
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  name?: string,
): Promise<Session & { userId: string }> {
  const trimmedEmail = email?.trim();
  if (!trimmedEmail) throw new AuthError("Email is required");
  if (!password || password.length < 8) {
    throw new AuthError("Password must be at least 8 characters");
  }

  const supabase = getSupabase();
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : undefined,
  });
  if (createErr || !created.user) {
    // Supabase returns a friendly message for "User already registered"
    throw new AuthError(createErr?.message ?? "Failed to create user", 400);
  }

  const session = await signInWithEmail(trimmedEmail, password);
  return { ...session, userId: created.user.id };
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string,
): Promise<void> {
  const trimmed = email?.trim();
  if (!trimmed) throw new AuthError("Email is required");
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  });
  if (error) {
    // Don't leak whether the email is registered; log only.
    console.warn(`sendPasswordResetEmail("${trimmed}"):`, error.message);
  }
}

export async function updatePasswordWithToken(
  accessToken: string,
  password: string,
): Promise<Session> {
  if (!accessToken) throw new AuthError("Missing reset token", 400);
  if (!password || password.length < 8) {
    throw new AuthError("Password must be at least 8 characters", 400);
  }
  const supabase = getSupabase();

  // Verify the JWT and resolve the user it belongs to.
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    throw new AuthError("Reset link is invalid or expired", 400);
  }

  // Service-role updates the password for that user id.
  const { error: updErr } = await supabase.auth.admin.updateUserById(userData.user.id, {
    password,
  });
  if (updErr) {
    throw new AuthError(updErr.message, 400);
  }

  // Sign in immediately so the user lands on /home authenticated.
  const email = userData.user.email;
  if (!email) {
    throw new AuthError("Account is missing an email — cannot sign in automatically", 400);
  }
  return signInWithEmail(email, password);
}

export async function getUserFromRequest(
  request: Request,
): Promise<AuthUser | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const accessToken = cookies[ACCESS_COOKIE];
  if (!accessToken) return null;
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as { name?: string };
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      name: meta.name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the user for a request, transparently refreshing the session when
 * the short-lived access token has expired but the long-lived refresh token
 * is still valid. Callers should set new cookies via {@link setSessionCookies}
 * when `refreshed` is non-null so the browser keeps the refreshed session.
 */
export async function getUserWithRefresh(
  request: Request,
): Promise<{ user: AuthUser | null; refreshed: Session | null }> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const accessToken = cookies[ACCESS_COOKIE];
  const refreshToken = cookies[REFRESH_COOKIE];
  const supabase = getSupabase();

  if (accessToken) {
    try {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data.user) {
        const meta = (data.user.user_metadata ?? {}) as { name?: string };
        return {
          user: {
            id: data.user.id,
            email: data.user.email ?? null,
            name: meta.name ?? null,
          },
          refreshed: null,
        };
      }
    } catch {
      // fall through to refresh
    }
  }

  if (!refreshToken) return { user: null, refreshed: null };

  // Fresh client — refreshSession mutates in-memory session state which would
  // poison subsequent DB queries on the shared client (see
  // createAuthSupabaseClient comment).
  const authClient = createAuthSupabaseClient();
  try {
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session || !data.user) {
      return { user: null, refreshed: null };
    }
    const meta = (data.user.user_metadata ?? {}) as { name?: string };
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
        name: meta.name ?? null,
      },
      refreshed: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? ONE_HOUR,
      },
    };
  } catch {
    return { user: null, refreshed: null };
  }
}

/**
 * Guard for API endpoints (returns JSON, not HTML). Returns user + headers;
 * throws a 401 JSON Response with cleared cookies when there's no valid
 * session. The returned `headers` carry refreshed Set-Cookie values from a
 * silent token refresh — thread them into the route's final Response so the
 * browser keeps the refreshed session.
 */
export async function requireUserApi(
  request: Request,
): Promise<{ user: AuthUser; headers: Headers }> {
  const { user, refreshed } = await getUserWithRefresh(request);
  const headers = new Headers();
  if (refreshed) setSessionCookies(headers, refreshed);
  if (!user) {
    clearSessionCookies(headers);
    headers.set("Content-Type", "application/json");
    throw new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers,
    });
  }
  return { user, headers };
}

/**
 * Guard for protected page loaders. Returns the user plus a Headers object
 * the loader should attach to its response (so Set-Cookie from a silent
 * refresh actually reaches the browser). Throws a 302 to /signin?next=... on
 * any unauthenticated request, clearing stale cookies so the next request
 * isn't stuck in a refresh loop.
 */
export async function requireUserOrRedirect(
  request: Request,
): Promise<{ user: AuthUser; headers: Headers }> {
  const { user, refreshed } = await getUserWithRefresh(request);
  const headers = new Headers();
  if (refreshed) setSessionCookies(headers, refreshed);

  if (!user) {
    clearSessionCookies(headers);
    const url = new URL(request.url);
    const next = encodeURIComponent(url.pathname + url.search);
    headers.set("Location", `/signin?next=${next}`);
    throw new Response(null, { status: 302, headers });
  }

  return { user, headers };
}

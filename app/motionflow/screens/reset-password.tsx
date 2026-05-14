import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  IconArrowRight,
  IconCheck,
  IconLogo,
  IconSparkle,
  Pill,
} from "../primitives";

type HashTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
  error: string | null;
};

function parseHash(hash: string): HashTokens {
  const tokens: HashTokens = {
    accessToken: null,
    refreshToken: null,
    type: null,
    error: null,
  };
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return tokens;
  const params = new URLSearchParams(trimmed);
  tokens.accessToken = params.get("access_token");
  tokens.refreshToken = params.get("refresh_token");
  tokens.type = params.get("type");
  const errCode = params.get("error_description") || params.get("error");
  if (errCode) tokens.error = errCode.replace(/\+/g, " ");
  return tokens;
}

type Strength = { score: number; label: string; level: "weak" | "fair" | "good" | "strong" };

function scorePassword(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 12) score++;
  const level: Strength["level"] =
    score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";
  const label = score === 0 ? "—" : level.charAt(0).toUpperCase() + level.slice(1);
  return { score, label, level };
}

export const ResetPasswordScreen = ({
  onDone,
  onBack,
  onGoSignIn,
}: {
  onDone?: () => void;
  onBack?: () => void;
  onGoSignIn?: () => void;
}) => {
  const [tokens, setTokens] = useState<HashTokens>({
    accessToken: null,
    refreshToken: null,
    type: null,
    error: null,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmit = password.length >= 8 && passwordsMatch && !submitting && !!tokens.accessToken;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseHash(window.location.hash);
    setTokens(parsed);
    // Strip the hash so the tokens don't linger in browser history.
    if (parsed.accessToken || parsed.error) {
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        // Ignore.
      }
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: tokens.accessToken,
          password,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Reset failed (${res.status})`);
        return;
      }
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const tokenError = tokens.error;
  const tokenMissing = !tokens.accessToken && !tokenError;

  return (
    <div className="mf-screen mf-auth">
      <div className="mf-bg-bloom" />
      <div className="mf-bg-grid" />

      <header className="mf-auth-top">
        <button className="mf-auth-brand" onClick={onBack} aria-label="Back">
          <IconLogo size={22} />
          <span>MotionFlow</span>
          <span className="mf-nav-badge">AI</span>
        </button>
        <div className="mf-auth-top-right">
          <span className="mf-auth-top-muted">Need help?</span>
          <button className="mf-nav-link" onClick={onGoSignIn}>
            Back to sign in
          </button>
        </div>
      </header>

      <main
        className="mf-auth-grid"
        style={{ gridTemplateColumns: "1fr", justifyItems: "center", alignContent: "center" }}
      >
        <section className="mf-auth-pane" style={{ maxWidth: 480, width: "100%" }}>
          <div className="mf-auth-card mf-glass">
            <div className="mf-auth-card-head">
              <Pill tone="glow" icon={<IconSparkle size={12} />}>
                PASSWORD RESET
              </Pill>
              <h2 className="mf-h2 mf-auth-card-title" style={{ marginTop: 12 }}>
                Set a new password.
              </h2>
              <p className="mf-body mf-auth-card-sub">
                Choose something at least 8 characters. You'll be signed in automatically once you save.
              </p>
            </div>

            {tokenError && (
              <div
                role="alert"
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,107,107,0.08)",
                  border: "1px solid rgba(255,107,107,0.35)",
                  fontSize: 13,
                  color: "#FCA5A5",
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                {tokenError}
              </div>
            )}

            {tokenMissing ? (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid var(--line)",
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  marginBottom: 14,
                }}
              >
                This page expects a reset link from your email. If you got here by mistake, request a new
                link from the sign-in page.
                <div style={{ marginTop: 12 }}>
                  <Button variant="ghost" size="sm" onClick={onGoSignIn}>
                    Back to sign in
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mf-auth-form" onSubmit={onSubmit}>
                <Field
                  label="New password"
                  htmlFor="reset-password"
                  aside={
                    <span className={`mf-strength mf-strength-${strength.level}`}>
                      {strength.label}
                    </span>
                  }
                >
                  <div className="mf-input-wrap">
                    <input
                      id="reset-password"
                      name="password"
                      className="mf-input"
                      type={showPw ? "text" : "password"}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="mf-input-toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="mf-strength-bar">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`mf-strength-seg ${i < strength.score ? `is-on lvl-${strength.level}` : ""}`}
                      />
                    ))}
                  </div>
                </Field>

                <Field label="Confirm password" htmlFor="reset-confirm">
                  <input
                    id="reset-confirm"
                    name="confirm"
                    className="mf-input"
                    type={showPw ? "text" : "password"}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  {confirm.length > 0 && !passwordsMatch && (
                    <div
                      className="mf-mono"
                      style={{
                        fontSize: 10,
                        color: "#FCA5A5",
                        letterSpacing: "0.06em",
                        marginTop: 4,
                      }}
                    >
                      PASSWORDS DON'T MATCH
                    </div>
                  )}
                  {confirm.length > 0 && passwordsMatch && (
                    <div
                      className="mf-mono"
                      style={{
                        fontSize: 10,
                        color: "#A6F0BD",
                        letterSpacing: "0.06em",
                        marginTop: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <IconCheck size={10} stroke={2.5} /> MATCH
                    </div>
                  )}
                </Field>

                {error && (
                  <div
                    role="alert"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(255,107,107,0.08)",
                      border: "1px solid rgba(255,107,107,0.35)",
                      fontSize: 12,
                      color: "#FCA5A5",
                      lineHeight: 1.45,
                    }}
                  >
                    {error}
                  </div>
                )}

                <Button
                  variant="glow"
                  size="lg"
                  iconRight={<IconArrowRight size={14} />}
                  style={{ width: "100%", justifyContent: "center" }}
                  type="submit"
                  disabled={!canSubmit}
                >
                  {submitting ? "Saving…" : "Set new password"}
                </Button>
              </form>
            )}

            <div className="mf-auth-foot">
              Remembered it?{" "}
              <button className="mf-auth-foot-link" onClick={onGoSignIn}>
                Back to sign in
              </button>
            </div>
          </div>

          <div className="mf-auth-legal mf-mono">
            By continuing you agree to the <a>Terms</a> and <a>Privacy Policy</a>.
          </div>
        </section>
      </main>
    </div>
  );
};

const Field = ({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <div className="mf-field">
    <div className="mf-field-row">
      <label htmlFor={htmlFor} className="mf-field-label">
        {label}
      </label>
      {aside}
    </div>
    {children}
  </div>
);

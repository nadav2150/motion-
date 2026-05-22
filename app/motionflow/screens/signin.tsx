import { useState, type ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import {
  Button,
  CinemaPreview,
  IconArrowRight,
  IconCheck,
  IconLogo,
  IconSparkle,
  Pill,
  useFrame,
} from "../primitives";

export const SignInScreen = ({
  error,
  onGoRegister,
  onForgot,
  onBack,
}: {
  error?: string;
  onGoRegister?: () => void;
  onForgot?: () => void;
  onBack?: () => void;
}) => {
  const f = useFrame();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <div className="mf-screen mf-auth">
      <div className="mf-bg-bloom" />
      <div className="mf-bg-grid" />

      <header className="mf-auth-top">
        <button className="mf-auth-brand" onClick={onBack} aria-label="Back to landing">
          <IconLogo size={22} />
          <span>Videly</span>
          <span className="mf-nav-badge">AI</span>
        </button>
        <div className="mf-auth-top-right">
          <span className="mf-auth-top-muted">New to Videly?</span>
          <button className="mf-nav-link" onClick={onGoRegister}>
            Create account
          </button>
        </div>
      </header>

      <main className="mf-auth-grid">
        {/* Left: cinematic showcase */}
        <section className="mf-auth-stage">
          <div className="mf-auth-stage-inner">
            <Pill tone="glow" icon={<IconSparkle size={12} />}>
              VIDELY · v2.4
            </Pill>
            <h1 className="mf-display mf-auth-display">
              Welcome back to <span className="mf-grad-text">cinema-grade</span> motion.
            </h1>
            <p className="mf-body mf-auth-sub">
              Pick up exactly where you left off. Your scenes, scripts, and renders are waiting.
            </p>

            <div className="mf-auth-cinema-wrap">
              <CinemaPreview aspect="16 / 10" frame={f} label="LAST SESSION · 00:08.42 · 4K · 24FPS">
                <div className="mf-auth-cinema-copy">
                  <div className="mf-mono mf-auth-cinema-tag">RESUMING</div>
                  <div className="mf-auth-cinema-title">Product launch · v3</div>
                </div>
                <div className="mf-auth-cinema-foot">
                  <div className="mf-auth-cinema-dot" />
                  <span className="mf-mono">SYNCED · 2 SECONDS AGO</span>
                </div>
              </CinemaPreview>

              <div className="mf-auth-floater" style={{ animationDelay: "0s" }}>
                <ProofRow
                  k="renders this week"
                  v="1,284"
                  spark={<Spark f={f} />}
                />
              </div>
              <div className="mf-auth-floater mf-auth-floater-b" style={{ animationDelay: "1.4s" }}>
                <div className="mf-auth-mini">
                  <div className="mf-auth-mini-icon">
                    <IconCheck size={12} stroke={2} />
                  </div>
                  <div>
                    <div className="mf-auth-mini-t">Auto-saved</div>
                    <div className="mf-auth-mini-s">Hyper preset · 32 keyframes</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mf-auth-logos">
              <span className="mf-mono mf-auth-logos-label">Trusted at</span>
              {["LINEAR", "RAYCAST", "CURSOR", "VERCEL", "ARC"].map((b) => (
                <span key={b} className="mf-auth-logo">{b}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Right: form */}
        <section className="mf-auth-pane">
          <div className="mf-auth-card mf-glass">
            <div className="mf-auth-card-head">
              <div className="mf-eyebrow">SIGN IN</div>
              <h2 className="mf-h2 mf-auth-card-title">Back to the canvas.</h2>
              <p className="mf-body mf-auth-card-sub">
                Use the email tied to your workspace.
              </p>
            </div>

            <div className="mf-auth-social">
              <SocialBtn icon={<GoogleMark />} label="Continue with Google" />
              <SocialBtn icon={<GitHubMark />} label="Continue with GitHub" />
            </div>

            <div className="mf-auth-divide">
              <span />
              <span className="mf-mono mf-auth-divide-label">OR EMAIL</span>
              <span />
            </div>

            <Form method="post" className="mf-auth-form">
              <Field label="Work email" htmlFor="auth-email">
                <input
                  id="auth-email"
                  name="email"
                  className="mf-input"
                  type="email"
                  placeholder="you@studio.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field
                label="Password"
                htmlFor="auth-password"
                aside={
                  <button type="button" className="mf-auth-aside-link" onClick={onForgot}>
                    Forgot?
                  </button>
                }
              >
                <div className="mf-input-wrap">
                  <input
                    id="auth-password"
                    name="password"
                    className="mf-input"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••••"
                    autoComplete="current-password"
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
              </Field>

              <label className="mf-auth-remember">
                <span className="mf-checkbox">
                  <input type="checkbox" defaultChecked />
                  <span className="mf-checkbox-box">
                    <IconCheck size={11} stroke={3} />
                  </span>
                </span>
                Keep me signed in for 30 days
              </label>

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
                disabled={submitting}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </Form>

            <div className="mf-auth-foot">
              No account yet?{" "}
              <button className="mf-auth-foot-link" onClick={onGoRegister}>
                Create one — it’s free
              </button>
            </div>
          </div>

          <div className="mf-auth-legal mf-mono">
            By signing in you agree to the <a>Terms</a> and <a>Privacy Policy</a>.
          </div>
        </section>
      </main>
    </div>
  );
};

/* ─────── Helpers ─────── */

const Field = ({
  label,
  htmlFor,
  children,
  aside,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  aside?: ReactNode;
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

const SocialBtn = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <button type="button" className="mf-auth-social-btn">
    <span className="mf-auth-social-icon">{icon}</span>
    <span>{label}</span>
  </button>
);

const ProofRow = ({ k, v, spark }: { k: string; v: string; spark: ReactNode }) => (
  <div className="mf-auth-proof">
    <div>
      <div className="mf-auth-proof-v">{v}</div>
      <div className="mf-auth-proof-k mf-mono">{k}</div>
    </div>
    <div className="mf-auth-proof-spark">{spark}</div>
  </div>
);

const Spark = ({ f }: { f: number }) => {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const x = (i / 15) * 80;
    const y = 14 + Math.sin((i + f / 6) / 1.4) * 8 + (i / 15) * -4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={80} height={28} viewBox="0 0 80 28">
      <defs>
        <linearGradient id="sp" x1="0" y1="0" x2="80" y2="0">
          <stop offset="0" stopColor="#7AA2FF" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#67E8F9" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#sp)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 0 1 0-24c3 0 5.8 1.1 8 3l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.3-.4-3.5z"/>
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.6l6.1 5.2C41.4 35.6 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z"/>
  </svg>
);

const GitHubMark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12 11.5 11.5 0 0 0 8.36 22.93c.58.1.79-.25.79-.55v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.74.4-1.26.73-1.55-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a11 11 0 0 1 5.74 0c2.18-1.48 3.14-1.17 3.14-1.17.63 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.39-2.7 5.36-5.26 5.64.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.79.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

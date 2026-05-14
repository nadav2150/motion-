import { useMemo, useState, type ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import {
  Button,
  CinemaPreview,
  IconArrowRight,
  IconCheck,
  IconLogo,
  IconSparkle,
  IconWand,
  Pill,
  useFrame,
} from "../primitives";

export const RegisterScreen = ({
  error,
  onGoSignIn,
  onBack,
}: {
  error?: string;
  onGoSignIn?: () => void;
  onBack?: () => void;
}) => {
  const f = useFrame();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const strength = useMemo(() => scorePassword(password), [password]);

  return (
    <div className="mf-screen mf-auth">
      <div className="mf-bg-bloom" />
      <div className="mf-bg-grid" />

      <header className="mf-auth-top">
        <button className="mf-auth-brand" onClick={onBack} aria-label="Back to landing">
          <IconLogo size={22} />
          <span>MotionFlow</span>
          <span className="mf-nav-badge">AI</span>
        </button>
        <div className="mf-auth-top-right">
          <span className="mf-auth-top-muted">Already on MotionFlow?</span>
          <button className="mf-nav-link" onClick={onGoSignIn}>
            Sign in
          </button>
        </div>
      </header>

      <main className="mf-auth-grid">
        {/* Left: cinematic showcase */}
        <section className="mf-auth-stage">
          <div className="mf-auth-stage-inner">
            <Pill tone="glow" icon={<IconSparkle size={12} />}>
              FREE · NO CARD REQUIRED
            </Pill>
            <h1 className="mf-display mf-auth-display">
              Your first <span className="mf-grad-text">cinematic launch</span> in 4 minutes.
            </h1>
            <p className="mf-body mf-auth-sub">
              Generate scenes, score them, render in 4K. Start free — keep your first three exports.
            </p>

            <div className="mf-auth-cinema-wrap">
              <CinemaPreview aspect="16 / 10" frame={f} label="ONBOARDING · SCENE 01 · 24FPS">
                <div className="mf-auth-cinema-copy">
                  <div className="mf-mono mf-auth-cinema-tag">WHAT YOU GET</div>
                  <div className="mf-auth-cinema-title">3 free 4K renders</div>
                </div>
                <div className="mf-auth-cinema-foot">
                  <div className="mf-auth-cinema-dot" />
                  <span className="mf-mono">ENGINE WARM · READY</span>
                </div>
              </CinemaPreview>

              <div className="mf-auth-floater" style={{ animationDelay: "0s" }}>
                <div className="mf-auth-mini">
                  <div className="mf-auth-mini-icon">
                    <IconWand size={12} stroke={2} />
                  </div>
                  <div>
                    <div className="mf-auth-mini-t">12 motion presets</div>
                    <div className="mf-auth-mini-s">Apple · Linear · Hyper · Noir</div>
                  </div>
                </div>
              </div>
              <div className="mf-auth-floater mf-auth-floater-b" style={{ animationDelay: "1.6s" }}>
                <div className="mf-auth-mini">
                  <div className="mf-auth-mini-icon">
                    <IconCheck size={12} stroke={2} />
                  </div>
                  <div>
                    <div className="mf-auth-mini-t">Brand kit auto-applied</div>
                    <div className="mf-auth-mini-s">Color, type, logo lockups</div>
                  </div>
                </div>
              </div>
            </div>

            <ul className="mf-auth-bullets">
              {[
                "Drag in screenshots — get a 30s film",
                "AI script + voiceover in 20 languages",
                "Export to MP4, WebM, ProRes, GIF",
              ].map((b) => (
                <li key={b}>
                  <span className="mf-auth-bullet-tick">
                    <IconCheck size={11} stroke={2.5} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Right: form */}
        <section className="mf-auth-pane">
          <div className="mf-auth-card mf-glass">
            <div className="mf-auth-card-head">
              <div className="mf-eyebrow">CREATE ACCOUNT</div>
              <h2 className="mf-h2 mf-auth-card-title">Start free in seconds.</h2>
              <p className="mf-body mf-auth-card-sub">
                No credit card. Cancel anytime — keep what you’ve made.
              </p>
            </div>

            <div className="mf-auth-social">
              <SocialBtn icon={<GoogleMark />} label="Sign up with Google" />
              <SocialBtn icon={<GitHubMark />} label="Sign up with GitHub" />
            </div>

            <div className="mf-auth-divide">
              <span />
              <span className="mf-mono mf-auth-divide-label">OR EMAIL</span>
              <span />
            </div>

            <Form method="post" className="mf-auth-form">
              <Field label="Full name" htmlFor="reg-name">
                <input
                  id="reg-name"
                  name="name"
                  className="mf-input"
                  type="text"
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <Field label="Work email" htmlFor="reg-email">
                <input
                  id="reg-email"
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
                htmlFor="reg-password"
                aside={
                  <span className={`mf-strength mf-strength-${strength.level}`}>
                    {strength.label}
                  </span>
                }
              >
                <div className="mf-input-wrap">
                  <input
                    id="reg-password"
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

              <label className="mf-auth-remember">
                <span className="mf-checkbox">
                  <input type="checkbox" defaultChecked />
                  <span className="mf-checkbox-box">
                    <IconCheck size={11} stroke={3} />
                  </span>
                </span>
                Email me product updates (no spam, ever)
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
                {submitting ? "Creating account…" : "Create account"}
              </Button>
            </Form>

            <div className="mf-auth-foot">
              Already have an account?{" "}
              <button className="mf-auth-foot-link" onClick={onGoSignIn}>
                Sign in
              </button>
            </div>
          </div>

          <div className="mf-auth-legal mf-mono">
            By creating an account you agree to the <a>Terms</a> and <a>Privacy Policy</a>.
          </div>
        </section>
      </main>
    </div>
  );
};

/* ─────── Helpers ─────── */

type StrengthLevel = "weak" | "fair" | "good" | "strong";

const scorePassword = (
  pw: string
): { score: number; level: StrengthLevel; label: string } => {
  if (!pw) return { score: 0, level: "weak", label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level: StrengthLevel = s <= 1 ? "weak" : s === 2 ? "fair" : s === 3 ? "good" : "strong";
  const label = { weak: "Too weak", fair: "Fair", good: "Good", strong: "Strong" }[level];
  return { score: s, level, label };
};

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

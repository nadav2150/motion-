import { useState, type ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import {
  Button,
  IconArrowRight,
  IconCheck,
  IconLogo,
  IconSparkle,
  Pill,
} from "../primitives";

export const ForgotPasswordScreen = ({
  error,
  sent,
  sentTo,
  onGoSignIn,
  onBack,
}: {
  error?: string;
  sent?: boolean;
  sentTo?: string;
  onGoSignIn?: () => void;
  onBack?: () => void;
}) => {
  const [email, setEmail] = useState(sentTo ?? "");
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
          <span className="mf-auth-top-muted">Remembered it?</span>
          <button className="mf-nav-link" onClick={onGoSignIn}>
            Sign in
          </button>
        </div>
      </header>

      <main className="mf-auth-grid mf-auth-grid-narrow">
        <section className="mf-auth-pane mf-auth-pane-center">
          <div className="mf-auth-card mf-glass">
            {sent ? (
              <SuccessState email={sentTo} onGoSignIn={onGoSignIn} />
            ) : (
              <>
                <div className="mf-auth-card-head">
                  <Pill tone="glow" icon={<IconSparkle size={12} />}>
                    PASSWORD RESET
                  </Pill>
                  <h2 className="mf-h2 mf-auth-card-title" style={{ marginTop: 14 }}>
                    Forgot your password?
                  </h2>
                  <p className="mf-body mf-auth-card-sub">
                    No worries — drop your email and we’ll send a secure link to reset it.
                    The link expires in 1 hour.
                  </p>
                </div>

                <Form method="post" className="mf-auth-form">
                  <Field label="Work email" htmlFor="forgot-email">
                    <input
                      id="forgot-email"
                      name="email"
                      className="mf-input"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
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
                    disabled={submitting}
                  >
                    {submitting ? "Sending link…" : "Send reset link"}
                  </Button>
                </Form>

                <div className="mf-auth-foot">
                  Remembered your password?{" "}
                  <button className="mf-auth-foot-link" onClick={onGoSignIn}>
                    Back to sign in
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mf-auth-legal mf-mono">
            We never share your email. Reset links are single-use.
          </div>
        </section>
      </main>
    </div>
  );
};

/* ─────── Success state ─────── */

const SuccessState = ({
  email,
  onGoSignIn,
}: {
  email?: string;
  onGoSignIn?: () => void;
}) => (
  <div className="mf-forgot-success">
    <div className="mf-forgot-success-mark">
      <span className="mf-forgot-success-ring" />
      <span className="mf-forgot-success-ring mf-forgot-success-ring-b" />
      <span className="mf-forgot-success-tick">
        <IconCheck size={28} stroke={2.5} />
      </span>
    </div>

    <div className="mf-eyebrow" style={{ textAlign: "center" }}>EMAIL ON THE WAY</div>
    <h2 className="mf-h2 mf-auth-card-title" style={{ textAlign: "center", marginTop: 8 }}>
      Check your inbox
    </h2>
    <p className="mf-body mf-auth-card-sub" style={{ textAlign: "center" }}>
      We sent a reset link to{" "}
      <span style={{ color: "var(--ink-0)", fontWeight: 500 }}>
        {email ?? "your email"}
      </span>
      . Click it to set a new password.
    </p>

    <ul className="mf-forgot-tips mf-mono">
      <li>· Link expires in 1 hour</li>
      <li>· Didn’t get it? Check spam / promotions</li>
      <li>· Use the same email tied to your workspace</li>
    </ul>

    <Button
      variant="ghost"
      size="lg"
      style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
      onClick={onGoSignIn}
    >
      Back to sign in
    </Button>
  </div>
);

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

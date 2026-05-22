import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Form, useNavigation } from "react-router";
import {
  IconArrowRight,
  IconCheck,
  IconChevron,
  IconLogo,
  useFrame,
  useIsMobile,
} from "../primitives";

/* Shared cinematic auth shell — single component drives /signin and
   /register via the `mode` prop. Mirrors the design exactly:
   - Desktop: two-column split with animated aurora bloom + floating
     cinema cards + brand mark + testimonial on the left, form on right.
   - Mobile (<720px): the cinematic stage collapses into a compact aurora
     banner above the form, OAuth buttons stack, and the mode-switch link
     moves to the bottom.

   The `<Form method="post">` element wraps the inputs so each route's
   action handler (sign-in / register) receives the same `email`,
   `password`, `name` field names it expects today. */
export const AuthScreen = ({
  mode,
  error,
  onSwitch,
  onBack,
  onForgot,
}: {
  mode: "login" | "register";
  error?: string;
  // Click the "Create an account" / "Sign in instead" link.
  onSwitch?: () => void;
  // Click the brand mark / "Back" link.
  onBack?: () => void;
  // Click the "Forgot?" link in the password field (login only).
  onForgot?: () => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const m = useIsMobile(rootRef, 720);
  const f = useFrame();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const isLogin = mode === "login";

  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(isLogin); // remember-me defaults on

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: m ? "auto" : "hidden",
        background: "#06070A",
        color: "var(--ink-1)",
        display: "grid",
        gridTemplateColumns: m ? "1fr" : "1.05fr 1fr",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      {!m && <CinematicStage f={f} />}
      {m && <MobileBanner mode={mode} onBack={onBack} />}

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          padding: m ? "22px 20px 32px" : "32px 56px",
          overflow: m ? "visible" : "auto",
        }}
      >
        {!m && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "none",
                color: "var(--ink-3)",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <IconChevron size={12} style={{ transform: "rotate(90deg)" }} />
              Back to site
            </button>
            <div
              className="mf-mono"
              style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)" }}
            >
              {isLogin ? "NEW HERE?" : "ALREADY HAVE AN ACCOUNT?"}{" "}
              <button
                type="button"
                onClick={onSwitch}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#DCE4FF",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "inherit",
                  fontSize: "inherit",
                  marginLeft: 6,
                  textDecoration: "underline",
                  textDecorationColor: "rgba(220,228,255,0.35)",
                }}
              >
                {isLogin ? "Create an account" : "Sign in instead"}
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: m ? "flex-start" : "center",
            maxWidth: 420,
            margin: "0 auto",
            width: "100%",
            paddingTop: m ? 4 : 24,
            paddingBottom: m ? 8 : 24,
          }}
        >
          {!m && (
            <>
              <div
                className="mf-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "#7AA2FF",
                  marginBottom: 12,
                }}
              >
                {isLogin ? "WELCOME BACK" : "JOIN VIDELY"}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 36,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                }}
              >
                {isLogin ? (
                  <>
                    Direct your next <span className="mf-grad-text">cinematic</span> launch.
                  </>
                ) : (
                  <>
                    Make a launch film <span className="mf-grad-text">in hours</span>, not weeks.
                  </>
                )}
              </h1>
            </>
          )}
          <p
            style={{
              marginTop: m ? 0 : 12,
              fontSize: m ? 13 : 14,
              color: "var(--ink-2)",
              lineHeight: 1.55,
            }}
          >
            {isLogin
              ? "Sign in to continue your storyboard, render queue, and saved brand kits."
              : "Free 3,100 credits to start. No credit card. Cancel anytime."}
          </p>

          <Form method="post" style={{ marginTop: m ? 18 : 26 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {!isLogin && (
                <AuthField
                  name="name"
                  label="Full name"
                  placeholder="Maya Okonkwo"
                  autoComplete="name"
                />
              )}
              <AuthField
                name="email"
                label="Work email"
                placeholder="you@studio.com"
                type="email"
                autoComplete="email"
                required
              />
              <AuthField
                name="password"
                label={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <span>Password</span>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={onForgot}
                        style={{
                          fontSize: 11,
                          color: "var(--ink-3)",
                          textDecoration: "none",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textTransform: "none",
                          letterSpacing: 0,
                        }}
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                }
                type={show ? "text" : "password"}
                placeholder={isLogin ? "Enter password" : "At least 8 characters"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={isLogin ? undefined : 8}
                right={
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--ink-3)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 11,
                      padding: "0 4px",
                    }}
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                }
              />
            </div>

            {!isLogin && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginTop: 16,
                  fontSize: 12,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  cursor: "pointer",
                }}
              >
                <span
                  onClick={() => setAgree(!agree)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    marginTop: 2,
                    border: `1px solid ${agree ? "rgba(122,162,255,0.6)" : "var(--line-2)"}`,
                    background: agree ? "var(--grad-aurora)" : "transparent",
                    display: "grid",
                    placeItems: "center",
                    color: "#0B0C10",
                    transition: "all 180ms",
                  }}
                >
                  {agree && <IconCheck size={11} stroke={3} />}
                </span>
                <span>
                  I agree to the <a href="#" style={{ color: "#DCE4FF" }}>Terms</a> and{" "}
                  <a href="#" style={{ color: "#DCE4FF" }}>Privacy Policy</a>.
                </span>
              </label>
            )}

            {isLogin && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 16,
                  fontSize: 12,
                  color: "var(--ink-2)",
                  cursor: "pointer",
                }}
              >
                <span
                  onClick={() => setAgree(!agree)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: `1px solid ${agree ? "rgba(122,162,255,0.6)" : "var(--line-2)"}`,
                    background: agree ? "var(--grad-aurora)" : "transparent",
                    display: "grid",
                    placeItems: "center",
                    color: "#0B0C10",
                    transition: "all 180ms",
                  }}
                >
                  {agree && <IconCheck size={11} stroke={3} />}
                </span>
                <span>Remember me on this device</span>
              </label>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
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

            <div style={{ marginTop: 22 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 10,
                  border: "1px solid rgba(167,139,250,0.45)",
                  background:
                    "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
                  color: "#0B0C10",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  fontFamily: "inherit",
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  boxShadow:
                    "0 8px 28px rgba(122,162,255,0.32), inset 0 1px 0 rgba(255,255,255,0.22)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {submitting
                  ? isLogin
                    ? "Signing in…"
                    : "Creating account…"
                  : isLogin
                  ? "Sign in"
                  : "Create account"}
                <IconArrowRight size={14} />
              </button>
            </div>
          </Form>

          <div
            style={{
              marginTop: m ? 18 : 22,
              textAlign: "center",
              fontSize: 11,
              color: "var(--ink-4)",
              lineHeight: 1.5,
            }}
          >
            Protected by reCAPTCHA · We never sell your data
          </div>

          {m && (
            <div
              style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}
            >
              {isLogin ? "New here? " : "Already have an account? "}
              <button
                type="button"
                onClick={onSwitch}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#DCE4FF",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(220,228,255,0.35)",
                  padding: 0,
                }}
              >
                {isLogin ? "Create an account" : "Sign in instead"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CinematicStage = ({ f }: { f: number }) => (
  <div style={{ position: "relative", overflow: "hidden", borderRight: "1px solid var(--line)" }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `
          radial-gradient(900px 600px at ${30 + Math.sin(f / 120) * 8}% ${
          25 + Math.cos(f / 140) * 6
        }%, rgba(122,162,255,0.22), transparent 55%),
          radial-gradient(700px 500px at ${75 + Math.sin(f / 100) * 6}% ${
          75 + Math.cos(f / 130) * 8
        }%, rgba(167,139,250,0.18), transparent 55%),
          radial-gradient(500px 400px at 50% 110%, rgba(103,232,249,0.12), transparent 55%)
        `,
        filter: "blur(10px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.32,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
      }}
    />

    <div style={{ position: "absolute", inset: 0 }}>
      {[
        { x: 12, y: 18, w: 280, h: 160, rot: -5, c: "linear-gradient(135deg, #5468FF, #2D3340)", label: "01 · COLD OPEN", del: 0 },
        { x: 56, y: 10, w: 220, h: 140, rot: 4,  c: "linear-gradient(135deg, #7AA2FF, #A78BFA)", label: "02 · HERO REVEAL", del: 1 },
        { x: 28, y: 52, w: 320, h: 190, rot: -2, c: "linear-gradient(135deg, #A78BFA, #67E8F9)", label: "03 · FEATURE MACRO", del: 2 },
        { x: 64, y: 56, w: 240, h: 150, rot: 6,  c: "linear-gradient(135deg, #1F2937, #5468FF)", label: "04 · WORKFLOW", del: 3 },
      ].map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: c.w,
            height: c.h,
            borderRadius: 14,
            background: c.c,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
            transform: `translateY(${Math.sin((f + c.del * 40) / 60) * 6}px) rotate(${
              c.rot + Math.sin((f + c.del * 30) / 80) * 0.6
            }deg)`,
            transition: "transform 200ms",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%)",
            }}
          />
          <div
            className="mf-mono"
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            {c.label}
          </div>
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 10,
              height: 4,
              borderRadius: 2,
              background: "rgba(255,255,255,0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${30 + i * 15 + Math.sin((f + c.del * 20) / 40) * 10}%`,
                background: "white",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
    </div>

    <div
      style={{
        position: "absolute",
        top: 28,
        left: 32,
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 3,
      }}
    >
      <IconLogo size={26} />
      <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em" }}>Videly AI</span>
    </div>

    <div
      style={{
        position: "absolute",
        left: 32,
        right: 32,
        bottom: 32,
        zIndex: 3,
        padding: "22px 24px",
        borderRadius: 16,
        background: "rgba(8,9,13,0.55)",
        backdropFilter: "blur(20px)",
        border: "1px solid var(--line)",
      }}
    >
      <div
        className="mf-mono"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 10 }}
      >
        WHAT TEAMS BUILD HERE
      </div>
      <div
        style={{
          fontSize: 22,
          lineHeight: 1.35,
          fontWeight: 500,
          letterSpacing: "-0.015em",
          textWrap: "pretty" as CSSProperties["textWrap"],
        }}
      >
        “We shipped our launch film in{" "}
        <span className="mf-grad-text">3 hours</span>, not 3 weeks. No agency, no Premiere, no
        compromise.”
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>Maya Okonkwo</div>
          <div
            className="mf-mono"
            style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}
          >
            HEAD OF BRAND · LATTICE
          </div>
        </div>
      </div>
    </div>
  </div>
);

const MobileBanner = ({
  mode,
  onBack,
}: {
  mode: "login" | "register";
  onBack?: () => void;
}) => {
  const isLogin = mode === "login";
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 20px 24px",
        overflow: "hidden",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(500px 320px at 30% 30%, rgba(122,162,255,0.30), transparent 60%),
            radial-gradient(400px 280px at 80% 60%, rgba(167,139,250,0.22), transparent 60%)
          `,
          filter: "blur(6px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconLogo size={20} />
          <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" }}>
            Videly AI
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--ink-3)",
            fontSize: 11.5,
            fontFamily: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <IconChevron size={11} style={{ transform: "rotate(90deg)" }} /> Back
        </button>
      </div>
      <div
        className="mf-mono"
        style={{
          position: "relative",
          marginTop: 18,
          fontSize: 9.5,
          color: "#7AA2FF",
          letterSpacing: "0.16em",
        }}
      >
        {isLogin ? "WELCOME BACK" : "JOIN VIDELY"}
      </div>
      <div
        style={{
          position: "relative",
          marginTop: 6,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.025em",
          lineHeight: 1.2,
        }}
      >
        {isLogin ? (
          <>
            Direct your next <span className="mf-grad-text">cinematic</span> launch.
          </>
        ) : (
          <>
            Make a launch film <span className="mf-grad-text">in hours</span>, not weeks.
          </>
        )}
      </div>
    </div>
  );
};

const AuthField = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  right,
  required,
  minLength,
  autoComplete,
}: {
  name: string;
  label: ReactNode;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  right?: ReactNode;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) => {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: "block" }}>
      <div
        className="mf-mono"
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          letterSpacing: "0.1em",
          marginBottom: 6,
          textTransform: typeof label === "string" ? "uppercase" : undefined,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "relative",
          height: 42,
          borderRadius: 10,
          background: "rgba(0,0,0,0.30)",
          border: `1px solid ${focus ? "rgba(122,162,255,0.5)" : "var(--line)"}`,
          boxShadow: focus ? "0 0 0 3px rgba(122,162,255,0.12)" : "none",
          transition: "all 180ms",
          display: "flex",
          alignItems: "center",
        }}
      >
        <input
          name={name}
          type={type}
          {...(value !== undefined && onChange
            ? { value, onChange: (e) => onChange(e.target.value) }
            : {})}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          style={{
            flex: 1,
            height: "100%",
            padding: "0 12px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--ink-1)",
            fontSize: 15, /* 15px+ blocks iOS auto-zoom on focus */
            fontFamily: "inherit",
          }}
        />
        {right && <div style={{ paddingRight: 8 }}>{right}</div>}
      </div>
    </label>
  );
};


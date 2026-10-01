import { useState, type ReactNode } from "react";
import { Form, useNavigation } from "react-router";
import { IconArrowRight, IconChevron } from "../primitives";

/* Shared auth shell — one component drives /signin and /register via the
   `mode` prop. Coral v2 look (matches /home):
   - Desktop (md+): two-column split — glass-card scene art on the left
     (/images/auth-art.webp), form on the right.
   - Mobile: the art becomes a short faded banner above the form, and the
     mode-switch link moves to the bottom.

   The `<Form method="post">` wraps the inputs so each route's action
   handler (sign-in / register) receives the `email`, `password`, `name`
   field names it expects. */
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
  // Click the "Back to site" link.
  onBack?: () => void;
  // Click the "Forgot?" link in the password field (login only).
  onForgot?: () => void;
}) => {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const isLogin = mode === "login";
  const [show, setShow] = useState(false);

  const switchLink = (
    <button
      type="button"
      onClick={onSwitch}
      className="inline-flex items-center gap-2 font-medium text-coral underline decoration-coral/40 underline-offset-4 transition-colors hover:text-coral-400"
    >
      {isLogin ? "Create an account" : "Sign in instead"}
      <IconArrowRight size={14} />
    </button>
  );

  return (
    <div className="grid min-h-dvh bg-[#14171d] text-paper md:grid-cols-[1.32fr_1fr]">
      {/* Art */}
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] bg-[#1b1f27] md:block" aria-hidden>
        <img
          src="/images/auth-art.webp"
          alt=""
          width={950}
          height={941}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="relative h-36 overflow-hidden md:hidden" aria-hidden>
        <img
          src="/images/auth-art.webp"
          alt=""
          width={950}
          height={941}
          className="size-full object-cover object-[50%_35%] [mask-image:linear-gradient(180deg,#000_45%,transparent_100%)]"
        />
      </div>

      {/* Form column */}
      <div className="relative flex flex-col px-4 pb-8 pt-5 sm:px-8 md:px-12 md:py-9 lg:px-[72px]">
        <div className="flex items-center justify-between text-[14px]">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-white/60 transition-colors hover:text-paper"
          >
            <IconChevron size={14} style={{ transform: "rotate(90deg)" }} />
            Back to site
          </button>
          <div className="hidden items-center gap-4 sm:flex">
            <span className="text-white/60">{isLogin ? "New here?" : "Already have an account?"}</span>
            {switchLink}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col justify-center py-8 md:py-12">
          <div className="flex items-center gap-3">
            <PlayMark />
            <span className="text-[30px] font-semibold tracking-[-0.02em]">Videly</span>
          </div>

          <p className="mt-10 text-[13px] font-medium uppercase tracking-[0.22em] text-white/70">
            {isLogin ? "Welcome back" : "Join Videly"}
          </p>
          <h1 className="mt-3 text-[36px] font-medium leading-[1.08] tracking-[-0.025em] sm:text-[44px] lg:text-[50px]">
            {isLogin ? (
              <>
                Direct your next <span className="text-coral">motion</span> launch.
              </>
            ) : (
              <>
                Make a launch video <span className="text-coral">in hours</span>, not weeks.
              </>
            )}
          </h1>
          <p className="mt-4 text-[17px] leading-[1.6] text-white/75">
            {isLogin
              ? "Sign in to continue your storyboard, render queue, and saved brand kits."
              : "Free 3,100 credits to start. No credit card. Cancel anytime."}
          </p>

          <Form method="post" className="mt-10 flex flex-col gap-6">
            {!isLogin && (
              <AuthField
                name="name"
                label="Full name"
                placeholder="Your full name"
                autoComplete="name"
                icon={<UserIcon />}
              />
            )}
            <AuthField
              name="email"
              label="Work email"
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
              icon={<MailIcon />}
            />
            <AuthField
              name="password"
              label="Password"
              labelRight={
                isLogin && (
                  <button
                    type="button"
                    onClick={onForgot}
                    className="text-[15px] font-medium text-coral transition-colors hover:text-coral-400"
                  >
                    Forgot?
                  </button>
                )
              }
              type={show ? "text" : "password"}
              placeholder={isLogin ? "Enter password" : "At least 8 characters"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={isLogin ? undefined : 8}
              icon={<LockIcon />}
              right={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="grid size-9 place-items-center rounded-lg text-white/60 transition-colors hover:text-paper"
                >
                  {show ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />

            <label className="-mt-1 flex cursor-pointer items-start gap-3 text-[15px] leading-[1.5] text-white/80">
              <input
                type="checkbox"
                defaultChecked={isLogin}
                className="mt-[3px] size-[18px] shrink-0 cursor-pointer rounded accent-coral"
              />
              {isLogin ? (
                <span>Remember me on this device</span>
              ) : (
                <span>
                  I agree to the{" "}
                  <a href="/terms" className="text-paper underline decoration-white/30 underline-offset-2">
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" className="text-paper underline decoration-white/30 underline-offset-2">
                    Privacy Policy
                  </a>
                  .
                </span>
              )}
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-400/35 bg-red-400/[0.08] px-4 py-3 text-[14px] leading-[1.45] text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(180deg,#f58f63_0%,#ef8354_100%)] text-[18px] font-semibold text-[#14171d] shadow-[0_10px_32px_-6px_rgba(239,131,84,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] transition-[filter,opacity] hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
            >
              {submitting
                ? isLogin
                  ? "Signing in…"
                  : "Creating account…"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
              <IconArrowRight size={18} stroke={2} />
            </button>
          </Form>

          <p className="mt-8 text-center text-[13px] text-white/50">
            Protected by reCAPTCHA • We never sell your data.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 text-[15px] sm:hidden">
            <span className="text-white/60">{isLogin ? "New here?" : "Have an account?"}</span>
            {switchLink}
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthField = ({
  name,
  label,
  labelRight,
  placeholder,
  type = "text",
  icon,
  right,
  required,
  minLength,
  autoComplete,
}: {
  name: string;
  label: string;
  labelRight?: ReactNode;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
  right?: ReactNode;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
}) => (
  <div>
    <div className="mb-2.5 flex items-center justify-between">
      <label htmlFor={`auth-${name}`} className="text-[13px] font-medium uppercase tracking-[0.16em] text-white/75">
        {label}
      </label>
      {labelRight}
    </div>
    <div className="flex h-14 items-center rounded-xl border border-white/[0.14] bg-[#191d24] transition-[border-color,box-shadow] focus-within:border-coral/60 focus-within:shadow-[0_0_0_3px_rgba(239,131,84,0.15)]">
      {icon && <span className="pl-5 text-white/60">{icon}</span>}
      <input
        id={`auth-${name}`}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="h-full min-w-0 flex-1 bg-transparent px-4 text-[16px] text-paper outline-none placeholder:text-white/45"
      />
      {right && <div className="pr-3">{right}</div>}
    </div>
  </div>
);

/* Videly mark. */
const PlayMark = () => (
  <img src="/logo-mark.png" width={42} height={42} alt="" aria-hidden className="block shrink-0" draggable={false} />
);

/* Field icons (lucide-style strokes, 20px). */
const FieldSvg = ({ children }: { children: ReactNode }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const MailIcon = () => (
  <FieldSvg>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </FieldSvg>
);
const LockIcon = () => (
  <FieldSvg>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </FieldSvg>
);
const UserIcon = () => (
  <FieldSvg>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </FieldSvg>
);
const EyeIcon = () => (
  <FieldSvg>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </FieldSvg>
);
const EyeOffIcon = () => (
  <FieldSvg>
    <path d="M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m2 2 20 20" />
  </FieldSvg>
);

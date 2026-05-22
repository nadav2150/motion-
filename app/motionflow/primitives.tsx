import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useNavigate, useRouteLoaderData } from "react-router";

/* ───────── Mobile detection ─────────
   Container-width based — measures the scroll container rather than the
   viewport so the layout reacts to its actual size. New screens should
   import this hook from primitives instead of duplicating it. */
export const useIsMobile = (
  ref: RefObject<HTMLDivElement | null>,
  threshold = 720,
) => {
  const [m, setM] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number) => setM(w < threshold);
    apply(el.clientWidth);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => apply(entries[0].contentRect.width));
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [ref, threshold]);
  return m;
};

/* ───────── Icons (custom, minimal stroke) ───────── */
type IconProps = {
  size?: number;
  stroke?: number;
  fill?: string;
  style?: CSSProperties;
};

type IconBaseProps = IconProps & { d: ReactNode };

const Icon = ({ d, size = 16, stroke = 1.5, fill = "none", style }: IconBaseProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {d}
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/></>} />
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>} />
);
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p} d={<><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></>} />
);
export const IconPlay = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke={0} d={<path d="M8 5v14l11-7z"/>} />
);
export const IconPause = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke={0} d={<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>} />
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p} d={<path d="m4 12 5 5L20 6"/>} />
);
export const IconImage = (p: IconProps) => (
  <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></>} />
);
export const IconText = (p: IconProps) => (
  <Icon {...p} d={<><path d="M4 7V5h16v2"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M7 19h10"/></>} />
);
export const IconPalette = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 22a10 10 0 1 1 10-10c0 1.5-1 3-3 3h-2a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 1 1 0 0 0-1 2z"/></>} />
);
export const IconWand = (p: IconProps) => (
  <Icon {...p} d={<><path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M3 21 14 10"/><path d="m17 7 4 4"/></>} />
);
export const IconShare = (p: IconProps) => (
  <Icon {...p} d={<><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></>} />
);
export const IconDownload = (p: IconProps) => (
  <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>} />
);
export const IconLink = (p: IconProps) => (
  <Icon {...p} d={<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>} />
);
export const IconScissors = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></>} />
);
export const IconLayers = (p: IconProps) => (
  <Icon {...p} d={<><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>} />
);
export const IconChevron = (p: IconProps) => (
  <Icon {...p} d={<path d="m6 9 6 6 6-6"/>} />
);
export const IconClose = (p: IconProps) => (
  <Icon {...p} d={<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>} />
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} />
);
export const IconTrash = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>} />
);
export const IconMusic = (p: IconProps) => (
  <Icon {...p} d={<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>} />
);
export const IconWave = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 12h2"/><path d="M19 12h2"/><path d="M7 8v8"/><path d="M11 5v14"/><path d="M15 8v8"/></>} />
);
export const IconMic = (p: IconProps) => (
  <Icon {...p} d={<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/></>} />
);
export const IconCamera = (p: IconProps) => (
  <Icon {...p} d={<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>} />
);
export const IconType = (p: IconProps) => (
  <Icon {...p} d={<><path d="M4 7V5h16v2"/><path d="M9 5v14"/><path d="M15 5v14"/></>} />
);
export const IconLibrary = (p: IconProps) => (
  <Icon {...p} d={<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>} />
);
export const IconHome = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 11 12 3l9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></>} />
);
export const IconFolder = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>} />
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} />
);
export const IconLogOut = (p: IconProps) => (
  <Icon {...p} d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>} />
);

export const IconLogo = ({ size = 24 }: { size?: number }) => (
  <img src="/logo.svg" width={size} height={size} alt="Videly" style={{ display: "block" }} />
);

/* ───────── Surfaces & Buttons ───────── */
export const Glass = ({
  children,
  style,
  className = "",
}: {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) => (
  <div className={`mf-glass ${className}`} style={style}>{children}</div>
);

type ButtonVariant = "primary" | "ghost" | "glow" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  onClick,
  style,
  type,
  disabled,
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}) => (
  <button
    type={type}
    disabled={disabled}
    className={`mf-btn mf-btn-${variant} mf-btn-${size}`}
    onClick={onClick}
    style={{ ...style, ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : null) }}
  >
    {icon && <span className="mf-btn-icon">{icon}</span>}
    <span>{children}</span>
    {iconRight && <span className="mf-btn-icon">{iconRight}</span>}
  </button>
);

export const Pill = ({
  children,
  tone = "default",
  icon,
}: {
  children?: ReactNode;
  tone?: "default" | "glow" | "success";
  icon?: ReactNode;
}) => (
  <span className={`mf-pill mf-pill-${tone}`}>
    {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
    {children}
  </span>
);

// Small inline on/off switch. Used in the audio sidebar accordions
// (voiceover / music / sfx) to opt in/out per track at Generate time.
// 32×16 track with a 12px sliding knob; gradient-on, neutral-off.
export const Switch = ({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    style={{
      position: "relative",
      width: 32,
      height: 16,
      borderRadius: 999,
      padding: 0,
      border: "1px solid",
      borderColor: checked
        ? "rgba(167,139,250,0.55)"
        : "rgba(255,255,255,0.10)",
      background: checked
        ? "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 60%, #67E8F9 100%)"
        : "rgba(255,255,255,0.06)",
      boxShadow: checked
        ? "0 0 0 1px rgba(167,139,250,0.20), 0 4px 12px rgba(122,162,255,0.25)"
        : "inset 0 1px 0 rgba(0,0,0,0.20)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background 220ms, border-color 220ms, box-shadow 220ms",
      flexShrink: 0,
      display: "inline-block",
      verticalAlign: "middle",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 1,
        left: checked ? 17 : 1,
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: checked
          ? "rgba(255,255,255,0.96)"
          : "rgba(220,228,255,0.85)",
        boxShadow: checked
          ? "0 1px 3px rgba(11,12,16,0.45)"
          : "0 1px 2px rgba(11,12,16,0.35)",
        transition: "left 220ms cubic-bezier(.2,.8,.2,1), background 220ms",
      }}
    />
  </button>
);

/* Top nav — landing only */
export const TopNav = ({
  onCta,
  onSignIn,
  isAuthed = false,
  mobile = false,
}: {
  onCta?: () => void;
  onSignIn?: () => void;
  // When true, the right side collapses to a single "Open the app" CTA
  // with a small "Signed in" indicator — Sign in + Start free would just
  // redirect to the same place.
  isAuthed?: boolean;
  // When true (container <720px), the nav collapses: links hidden,
  // padding tightens, "Sign in" hidden so only the primary CTA remains.
  mobile?: boolean;
}) => (
  <nav className="mf-nav" style={mobile ? { padding: "14px 20px" } : undefined}>
    <div className="mf-nav-brand">
      <IconLogo size={22}/>
      <span>Videly</span>
      <span className="mf-nav-badge">AI</span>
    </div>
    {!mobile && (
      <div className="mf-nav-links">
        <a>Product</a><a>Showcase</a><a>Pricing</a><a>Docs</a>
      </div>
    )}
    <div className="mf-nav-cta">
      {isAuthed ? (
        <>
          {!mobile && (
            <span
              className="mf-mono"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 10.5, letterSpacing: "0.10em",
                color: "var(--ink-3)",
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#A6F0BD",
                  boxShadow: "0 0 8px rgba(166,240,189,0.7)",
                }}
              />
              SIGNED IN
            </span>
          )}
          <Button size="sm" variant="primary" onClick={onCta} iconRight={<IconArrowRight size={14}/>}>Open the app</Button>
        </>
      ) : (
        <>
          {!mobile && (
            <button
              className="mf-nav-link"
              onClick={onSignIn}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }}
            >
              Sign in
            </button>
          )}
          <Button size="sm" variant="primary" onClick={onCta} iconRight={<IconArrowRight size={14}/>}>Start free</Button>
        </>
      )}
    </div>
  </nav>
);

/* App chrome — used on screens 2–6 */
export type NavKey = "home" | "projects" | "settings";

type AuthedUser = { id: string; email: string | null; name: string | null };

function initialsFor(user: AuthedUser | null | undefined): string {
  if (!user) return "—";
  if (user.name && user.name.trim()) {
    const parts = user.name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "—";
  }
  if (user.email) {
    const local = user.email.split("@")[0] ?? "";
    return local.slice(0, 2).toUpperCase() || "—";
  }
  return "—";
}

const SideAvatar = () => {
  const data = useRouteLoaderData("root") as { user?: AuthedUser | null } | undefined;
  const user = data?.user ?? null;

  if (!user) {
    return (
      <a
        href="/signin"
        className="mf-side-btn"
        aria-label="Sign in"
        style={{ textDecoration: "none" }}
      >
        <IconLogOut size={18} style={{ transform: "scaleX(-1)" }} />
      </a>
    );
  }

  const initials = initialsFor(user);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div className="mf-avatar" aria-hidden>
        {initials}
      </div>
      <form method="post" action="/api/auth/signout" style={{ margin: 0 }}>
        <button
          type="submit"
          className="mf-side-btn"
          aria-label="Sign out"
          style={{ color: "#FCA5A5" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,107,107,0.08)";
            e.currentTarget.style.borderColor = "rgba(255,107,107,0.20)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <IconLogOut size={18} />
        </button>
      </form>
    </div>
  );
};

export const AppChrome = ({
  active,
  onNav,
  project = "Untitled launch",
  children,
  right,
  credits,
  mobile = false,
}: {
  active?: string;
  onNav?: (k: NavKey) => void;
  project?: string;
  children?: ReactNode;
  right?: ReactNode;
  // Live credit balance from user_billing.credits_balance. When provided,
  // renders a CreditsPill at the start of the top-bar right cluster. Pass
  // null while the balance is loading; omit entirely to hide the pill.
  credits?: number | null;
  // When true (container <720px), the sidebar collapses and a bottom
  // tab bar replaces it with the same Home / Projects / Settings choices.
  mobile?: boolean;
}) => {
  if (mobile) {
    return (
      <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderBottom: "1px solid var(--line)",
            background: "rgba(8,9,13,0.6)", backdropFilter: "blur(20px)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <IconLogo size={20}/>
            <span
              style={{
                fontSize: 13.5, fontWeight: 500, color: "var(--ink-0)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {project}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {typeof credits === "number" && <CreditsPill credits={credits} />}
            {right}
          </div>
        </header>
        <div className="mf-content" style={{ flex: 1, overflow: "auto", paddingBottom: 64 }}>
          {children}
        </div>
        <nav
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            display: "flex", padding: "8px 12px",
            borderTop: "1px solid var(--line)",
            background: "rgba(6,7,10,0.92)", backdropFilter: "blur(20px)",
            flexShrink: 0,
          }}
        >
          {([
            { k: "home" as const,     icon: <IconHome size={18}/>,     label: "Home" },
            { k: "projects" as const, icon: <IconFolder size={18}/>,   label: "Projects" },
            { k: "settings" as const, icon: <IconSettings size={16}/>, label: "Settings" },
          ]).map((it) => (
            <button
              key={it.k}
              onClick={() => onNav?.(it.k)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "6px 0", background: "transparent", border: "none", cursor: "pointer",
                color: active === it.k ? "var(--ink-0)" : "var(--ink-3)",
                fontFamily: "inherit", fontSize: 10.5, fontWeight: 500, letterSpacing: "-0.005em",
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }
  return (
    <div className="mf-app">
      <aside className="mf-side">
        <div className="mf-side-brand">
          <IconLogo size={22}/>
        </div>
        <div className="mf-side-stack">
          {([
            { k: "home" as const,     icon: <IconHome size={18}/>,     label: "Home" },
            { k: "projects" as const, icon: <IconFolder size={18}/>,   label: "Projects" },
            { k: "settings" as const, icon: <IconSettings size={16}/>, label: "Settings" },
          ]).map((it) => (
            <button
              key={it.k}
              className={`mf-side-btn ${active === it.k ? "is-active" : ""}`}
              onClick={() => onNav?.(it.k)}
              title={it.label}
            >
              {it.icon}
            </button>
          ))}
        </div>
        <div className="mf-side-foot">
          <SideAvatar />
        </div>
      </aside>
      <main className="mf-main">
        <header className="mf-topbar">
          <div className="mf-crumb">
            <span className="mf-crumb-muted">Projects</span>
            <IconChevron size={12} style={{ transform: "rotate(-90deg)", opacity: 0.4 }}/>
            <span>{project}</span>
          </div>
          <div className="mf-topbar-right">
            {typeof credits === "number" && <CreditsPill credits={credits} />}
            {right}
          </div>
        </header>
        <div className="mf-content">{children}</div>
      </main>
    </div>
  );
};

export const CreditsPill = ({ credits }: { credits: number }) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/pricing")}
      title="View plans & buy more credits"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "0 11px", height: 28, borderRadius: 8,
        background: "rgba(122,162,255,0.06)",
        border: "1px solid rgba(122,162,255,0.25)",
        color: "var(--ink-1)", fontFamily: "inherit", fontSize: 12, fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <IconSparkle size={11} style={{ color: "#7AA2FF" }} />
      <span>
        <strong style={{ color: "white" }}>{credits.toLocaleString()}</strong> credits
      </span>
    </button>
  );
};

/* Striped image placeholder */
export const Placeholder = ({
  label,
  w,
  h,
  style,
  accent = "rgba(255,255,255,0.05)",
}: {
  label?: string;
  w?: number | string;
  h?: number | string;
  style?: CSSProperties;
  accent?: string;
}) => (
  <div className="mf-ph" style={{ width: w, height: h, ...style }}>
    <div
      className="mf-ph-stripes"
      style={{
        backgroundImage: `repeating-linear-gradient(135deg, ${accent} 0 8px, transparent 8px 16px)`,
      }}
    />
    <div className="mf-ph-label">{label}</div>
  </div>
);

/* Animated cinematic preview frame */
export const CinemaPreview = ({
  aspect = "16 / 9",
  label,
  frame = 0,
  style,
  children,
}: {
  aspect?: string;
  label?: string;
  frame?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) => (
  <div className="mf-cinema" style={{ aspectRatio: aspect, ...style }}>
    <div className="mf-cinema-grain"/>
    <div
      className="mf-cinema-orb mf-cinema-orb-a"
      style={{ transform: `translate3d(${Math.sin(frame / 40) * 40}px, ${Math.cos(frame / 55) * 30}px, 0)` }}
    />
    <div
      className="mf-cinema-orb mf-cinema-orb-b"
      style={{ transform: `translate3d(${Math.cos(frame / 30) * 60}px, ${Math.sin(frame / 45) * 40}px, 0)` }}
    />
    <div
      className="mf-cinema-orb mf-cinema-orb-c"
      style={{ transform: `translate3d(${Math.sin(frame / 60) * 50}px, ${Math.sin(frame / 35) * 25}px, 0)` }}
    />
    <div className="mf-cinema-vignette"/>
    {label && <div className="mf-cinema-label">{label}</div>}
    {children}
  </div>
);

/* useFrame — rAF tick for ambient motion */
export const useFrame = (running = true): number => {
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let alive = true;
    const tick = () => {
      setF((x) => x + 1);
      if (alive) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [running]);
  return f;
};

/* Marquee — used on landing */
export const Marquee = ({
  children,
  speed = 40,
}: {
  children?: ReactNode;
  speed?: number;
}) => (
  <div
    style={{
      overflow: "hidden",
      whiteSpace: "nowrap",
      maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
      WebkitMaskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
    }}
  >
    <div style={{ display: "inline-flex", animation: `mf-marquee ${speed}s linear infinite` }}>
      {children}
    </div>
  </div>
);

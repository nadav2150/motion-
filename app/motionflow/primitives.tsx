import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouteLoaderData } from "react-router";

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

export const IconLogo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="mf-logo-gradient" x1="0" y1="0" x2="32" y2="32">
        <stop offset="0" stopColor="#7AA2FF"/>
        <stop offset="0.5" stopColor="#A78BFA"/>
        <stop offset="1" stopColor="#67E8F9"/>
      </linearGradient>
    </defs>
    <path d="M6 22 L6 10 L12 16 L18 10 L18 22" stroke="url(#mf-logo-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="24" cy="16" r="2.5" fill="url(#mf-logo-gradient)"/>
  </svg>
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

/* Top nav — landing only */
export const TopNav = ({
  onCta,
  onSignIn,
}: {
  onCta?: () => void;
  onSignIn?: () => void;
}) => (
  <nav className="mf-nav">
    <div className="mf-nav-brand">
      <IconLogo size={22}/>
      <span>MotionFlow</span>
      <span className="mf-nav-badge">AI</span>
    </div>
    <div className="mf-nav-links">
      <a>Product</a><a>Showcase</a><a>Pricing</a><a>Docs</a>
    </div>
    <div className="mf-nav-cta">
      <button
        className="mf-nav-link"
        onClick={onSignIn}
        style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }}
      >
        Sign in
      </button>
      <Button size="sm" variant="primary" onClick={onCta} iconRight={<IconArrowRight size={14}/>}>Start free</Button>
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = initialsFor(user);
  const label = user?.name || user?.email || "Account";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="mf-avatar"
        onClick={() => setOpen((v) => !v)}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: "transparent",
          border: 0,
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
          padding: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 4,
            minWidth: 220,
            padding: 8,
            background: "rgba(11,12,16,0.96)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
            backdropFilter: "blur(12px)",
            zIndex: 50,
          }}
        >
          {user ? (
            <>
              <div style={{ padding: "8px 10px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-0)", fontWeight: 500, lineHeight: 1.3 }}>
                  {user.name || (user.email ? user.email.split("@")[0] : "Account")}
                </span>
                {user.email && (
                  <span
                    className="mf-mono"
                    style={{
                      fontSize: 10,
                      color: "var(--ink-3)",
                      letterSpacing: "0.04em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {user.email}
                  </span>
                )}
              </div>
              <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
              <form method="post" action="/api/auth/signout" style={{ margin: 0 }}>
                <button
                  type="submit"
                  role="menuitem"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    background: "transparent",
                    border: 0,
                    color: "#FCA5A5",
                    fontSize: 12.5,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,107,107,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, color: "var(--ink-1)", marginBottom: 4 }}>Not signed in</div>
              <a
                href="/signin"
                className="mf-mono"
                style={{ fontSize: 11, color: "#7AA2FF", letterSpacing: "0.04em" }}
              >
                Sign in →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AppChrome = ({
  active,
  onNav,
  project = "Untitled launch",
  children,
  right,
}: {
  active?: string;
  onNav?: (k: NavKey) => void;
  project?: string;
  children?: ReactNode;
  right?: ReactNode;
}) => (
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
        <div className="mf-topbar-right">{right}</div>
      </header>
      <div className="mf-content">{children}</div>
    </main>
  </div>
);

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

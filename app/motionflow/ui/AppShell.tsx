import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  Bell,
  Crown,
  Film,
  FolderOpen,
  Home,
  LayoutTemplate,
  LogOut,
  Menu as MenuIcon,
  Palette,
  Settings,
  Users,
  X,
} from "lucide-react";
import { isMockMode, type UsageInfo } from "./api";
import { cn, formatNumber } from "./format";
import { focusRing, IconButton } from "./Button";
import { SearchBar } from "./controls";
import { Menu } from "./Menu";
import { Logo } from "./Logo";
import { ToastHost } from "./Toast";
import { ProgressBar } from "./Card";
import { useSharedUsage } from "./usage-store";
import { UpsellHost, openUpsell } from "./upsell";
import { LowCreditBanner } from "./LowCreditBanner";
import { usePurchaseReturn } from "./purchase-return";

export type ShellUser = { id: string; name: string | null; email: string | null };

export type ShellProps = {
  user: ShellUser;
  planTier?: string | null;
  credits?: number | null;
  children: ReactNode;
  // Full-bleed pages (video page) use a wider content area.
  wide?: boolean;
  // Home: transparent top bar without the search field, so the hero runs
  // up to the bell/avatar like the design.
  bare?: boolean;
};

// Shell palette from the v2 home design. Set inline because .vd-root's
// unlayered background would beat Tailwind's layered bg-* utilities.
const SHELL_BG = "#060c11";
const SIDEBAR_BG = "#070e13";

const NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/videos", label: "My Videos", icon: Film },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/brand", label: "Brand", icon: Palette },
  { to: "/assets", label: "Assets", icon: FolderOpen },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = [NAV[0], NAV[1], NAV[2], NAV[4]] as const;

const PLAN_NAMES: Record<string, string> = {
  free: "Free Plan",
  starter: "Starter Plan",
  pro: "Pro Plan",
  studio: "Studio Plan",
};

// Plan widget data: GET /api/me/usage (shared across the shell, see
// usage-store.ts), falling back to what the loader knew.
export function useUsage(planTier?: string | null, credits?: number | null): UsageInfo | null {
  return useSharedUsage(
    credits != null
      ? { planTier: planTier ?? "free", planName: PLAN_NAMES[planTier ?? "free"] ?? "Free Plan", creditsBalance: credits, creditsMonthly: 0 }
      : null,
  );
}

function initials(u: ShellUser): string {
  const src = u.name?.trim() || u.email?.split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]!.toUpperCase()).join("") || "?";
}

function signOut() {
  const f = document.createElement("form");
  f.method = "post";
  f.action = "/api/auth/signout";
  document.body.appendChild(f);
  f.submit();
}

function PlanWidget({ usage }: { usage: UsageInfo | null }) {
  if (!usage) {
    return <div className="vd-skeleton h-[92px] rounded-2xl" aria-hidden />;
  }
  const hasMonthly = usage.creditsMonthly > 0;
  const frac = hasMonthly ? usage.creditsBalance / usage.creditsMonthly : 1;
  const isFree = usage.planTier === "free";
  const isTop = usage.planTier === "studio";
  return (
    <div className="rounded-xl border border-[#18202a] bg-[#0c131b] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-paper">
        <Crown className="size-4 text-coral" aria-hidden />
        {usage.planName}
      </div>
      <p className="mt-1.5 text-[12.5px] tabular-nums text-silver">
        {formatNumber(usage.creditsBalance)}
        {hasMonthly && ` / ${formatNumber(usage.creditsMonthly)}`} credits
      </p>
      <ProgressBar value={frac} className="mt-3" label="Credits remaining" />
      <button
        type="button"
        onClick={() => openUpsell("plan_widget", { balance: usage.creditsBalance, surface: "sidebar" })}
        className={cn("mt-3 inline-block text-[12.5px] font-semibold text-coral hover:text-coral-400", focusRing)}
      >
        {isFree ? "Upgrade plan →" : isTop ? "Top up credits →" : "Upgrade or top up →"}
      </button>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex h-[52px] items-center gap-3.5 rounded-[10px] border px-4 text-[15px] font-medium transition-colors",
              isActive
                ? "border-coral/25 bg-[linear-gradient(90deg,rgb(239_131_84/0.26)_0%,rgb(23_28_36/0.95)_42%)] text-paper shadow-[inset_2px_0_0_rgb(239_131_84/0.85),0_0_22px_-8px_rgb(239_131_84/0.55)]"
                : "border-transparent text-[#d3d5da] hover:bg-white/[0.04] hover:text-paper",
              focusRing,
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cn("size-[22px] stroke-[1.6]", isActive ? "text-coral-400" : "text-[#c4c5cb]")} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ user, planTier, credits, children, wide, bare }: ShellProps) {
  const usage = useUsage(planTier, credits);
  usePurchaseReturn();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [mock, setMock] = useState(false);

  useEffect(() => setMock(isMockMode()), []);
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!bellOpen) return;
    const close = (e: MouseEvent) => !bellRef.current?.contains(e.target as Node) && setBellOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBellOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [bellOpen]);

  const search = (value: string) => navigate(`/videos${value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ""}`);

  return (
    <div className="vd-root min-h-screen" style={{ background: SHELL_BG }}>
      <a
        href="#main"
        className="sr-only z-[200] rounded-lg bg-coral px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[212px] flex-col border-r border-[#0f151d] px-3 py-6 lg:flex"
        style={{ background: SIDEBAR_BG }}
      >
        <div className="px-4 pb-10">
          <Logo href="/home" />
        </div>
        <SidebarNav />
        <div className="mt-auto">
          <PlanWidget usage={usage} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-hidden />
          <div
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col px-3 py-5 shadow-[var(--shadow-lift)]"
            style={{ background: SIDEBAR_BG }}
          >
            <div className="flex items-center justify-between px-2 pb-6">
              <Logo href="/home" />
              <IconButton label="Close menu" onClick={() => setDrawer(false)}>
                <X className="size-5" aria-hidden />
              </IconButton>
            </div>
            <SidebarNav onNavigate={() => setDrawer(false)} />
            <div className="mt-auto">
              <PlanWidget usage={usage} />
            </div>
          </div>
        </div>
      )}

      <div className="relative lg:pl-[212px]">
        {/* Top bar */}
        <header
          className={cn(
            "sticky top-0 z-20",
            bare
              ? "bg-[#060c11]/85 backdrop-blur-md lg:absolute lg:inset-x-0 lg:bg-transparent lg:backdrop-blur-none"
              : "border-b border-[#10161e] bg-[#060c11]/85 backdrop-blur-md",
          )}
        >
          <div className={cn("mx-auto flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8", !wide && "max-w-[1400px]")}>
            <IconButton label="Open menu" className="lg:hidden" onClick={() => setDrawer(true)}>
              <MenuIcon className="size-5" aria-hidden />
            </IconButton>
            <div className="lg:hidden">
              <Logo href="/home" size={26} />
            </div>
            <SearchBar
              value={q}
              onChange={setQ}
              onSubmit={search}
              label="Search videos, templates, assets"
              placeholder="Search videos, templates, assets..."
              className={cn("hidden w-full max-w-[460px] sm:block", bare && "sm:hidden")}
            />
            <div className="ml-auto flex items-center gap-1.5">
              {mock && (
                <span className="hidden rounded-md border border-coral/50 px-2 py-0.5 text-[11px] font-semibold text-coral md:inline">
                  MOCK DATA
                </span>
              )}
              <div ref={bellRef} className="relative">
                <IconButton label="Notifications" aria-expanded={bellOpen} onClick={() => setBellOpen((o) => !o)}>
                  <Bell className="size-5" aria-hidden />
                </IconButton>
                {bellOpen && (
                  <div
                    role="status"
                    className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate/55 bg-ink-800 p-4 text-sm shadow-[var(--shadow-lift)]"
                  >
                    <p className="font-semibold text-paper">Notifications</p>
                    <p className="mt-1.5 text-silver">You're all caught up. We'll let you know when a video is ready.</p>
                  </div>
                )}
              </div>
              <Menu
                label="Account menu"
                triggerClassName="size-9 rounded-full"
                trigger={
                  <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-coral to-[#c9643d] text-[13px] font-bold text-white">
                    {initials(user)}
                  </span>
                }
                header={
                  <div className="mb-1 border-b border-slate/40 px-2.5 pb-2.5 pt-1">
                    <p className="truncate text-sm font-semibold text-paper">{user.name || "Your account"}</p>
                    {user.email && <p className="truncate text-xs text-silver">{user.email}</p>}
                  </div>
                }
                items={[
                  { label: "Settings", icon: <Settings />, onSelect: () => navigate("/settings") },
                  { label: "Sign out", icon: <LogOut />, onSelect: signOut, danger: true },
                ]}
              />
            </div>
          </div>
        </header>

        <main
          id="main"
          className={cn("mx-auto px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12", wide ? "max-w-[1600px]" : "max-w-[1400px]")}
        >
          <LowCreditBanner usage={usage} />
          {children}
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate/40 bg-ink/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-md lg:hidden"
      >
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium",
                isActive ? "text-coral" : "text-silver",
                focusRing,
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className={cn("flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-silver", focusRing)}
        >
          <MenuIcon className="size-5" aria-hidden />
          More
        </button>
      </nav>

      <ToastHost />
      <UpsellHost />
    </div>
  );
}

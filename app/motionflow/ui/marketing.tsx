// Public marketing chrome: sticky blurred header + footer. Used by the
// landing page and (through MarketingShell) the use-case and vs.* pages.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Menu as MenuIcon, X } from "lucide-react";
import { FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { Logo } from "./Logo";
import { ButtonLink, IconButton, focusRing } from "./Button";
import { cn } from "./format";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#templates", label: "Templates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "Resources" },
];

export function MarketingHeader({ isAuthed = false }: { isAuthed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors",
        scrolled || open ? "border-slate/35 bg-ink-900/80 backdrop-blur-lg" : "border-transparent bg-ink-900/40 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:h-[72px]">
        <Logo href="/" />
        <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              className={cn("rounded-lg px-3 py-2 text-[14.5px] font-medium text-silver transition-colors hover:text-paper", focusRing)}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {isAuthed ? (
            <ButtonLink to="/home" size="md" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Open the app
            </ButtonLink>
          ) : (
            <>
              <Link
                to="/signin"
                className={cn("hidden rounded-lg px-3 py-2 text-[14.5px] font-medium text-paper hover:text-coral sm:inline-block", focusRing)}
              >
                Sign in
              </Link>
              <ButtonLink to="/register" size="md">
                Get started
              </ButtonLink>
            </>
          )}
          <IconButton label={open ? "Close menu" : "Open menu"} className="md:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
          </IconButton>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-slate/35 px-4 pb-4 pt-2 md:hidden">
          {NAV.map((n) => (
            <a
              key={n.label}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cn("block rounded-lg px-3 py-3 text-base font-medium text-paper hover:bg-slate/30", focusRing)}
            >
              {n.label}
            </a>
          ))}
          {!isAuthed && (
            <Link to="/signin" className={cn("block rounded-lg px-3 py-3 text-base font-medium text-coral", focusRing)}>
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

const FOOTER_COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#templates", label: "Templates" },
      { href: "/pricing", label: "Pricing" },
      { href: "/register", label: "Get started" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/launch-videos", label: "Launch videos" },
      { href: "/feature-announcement-videos", label: "Feature announcements" },
      { href: "/product-demo-videos", label: "Product demos" },
    ],
  },
  {
    title: "Compare",
    links: [
      { href: "/vs/loom", label: "Videly vs Loom" },
      { href: "/vs/synthesia", label: "Videly vs Synthesia" },
      { href: "/vs/runway", label: "Videly vs Runway" },
      { href: "/vs/pictory", label: "Videly vs Pictory" },
      { href: "/vs/veed", label: "Videly vs Veed" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/refund", label: "Refund policy" },
    ],
  },
];

// Social profiles: add real URLs as the accounts go live. Entries without an
// href are not rendered.
const SOCIAL: { label: string; href: string | null; icon: typeof FaXTwitter }[] = [
  { label: "Videly on X", href: null, icon: FaXTwitter },
  { label: "Videly on LinkedIn", href: null, icon: FaLinkedin },
  { label: "Videly on YouTube", href: null, icon: FaYoutube },
  { label: "Videly on Instagram", href: null, icon: FaInstagram },
];

export function MarketingFooter() {
  const socials = SOCIAL.filter((s) => s.href);
  return (
    <footer className="border-t border-slate/35 bg-ink-950">
      <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo href="/" />
            <p className="mt-4 text-sm leading-relaxed text-silver">
              Turn any idea into a stunning motion video. Describe it, add your content, and export in minutes.
            </p>
            {socials.length > 0 && (
              <div className="mt-5 flex gap-2">
                {socials.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href!}
                    aria-label={label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn("flex size-9 items-center justify-center rounded-lg bg-ink text-silver hover:text-paper", focusRing)}
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:col-span-4">
            {FOOTER_COLS.map((c) => (
              <div key={c.title}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-silver">{c.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} className={cn("rounded text-sm text-paper/85 hover:text-coral", focusRing)}>
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-slate/30 pt-6 text-xs text-silver sm:flex-row sm:justify-between">
          <span>© {2026} Videly. All rights reserved.</span>
          <span>Made with Videly.</span>
        </div>
      </div>
    </footer>
  );
}

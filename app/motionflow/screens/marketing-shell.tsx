// Shared shell for marketing SEO pages (use-case landing pages and
// competitor comparison pages). Renders the same TopNav, aurora bloom
// background, and a content-rich footer used as the internal link graph
// that ties the marketing pages together. Crawlers follow these footer
// links so every page in the cluster gets discovered and gets a small
// internal-link signal.
//
// Pages render their own hero + sections as `children`. The shell only
// owns chrome (nav, bg, footer).

import type { ReactNode } from "react";
import { TopNav, useIsMobile } from "../primitives";
import { useRef } from "react";

const USE_CASE_LINKS: Array<{ href: string; label: string }> = [
  { href: "/launch-videos",               label: "Launch videos" },
  { href: "/feature-announcement-videos", label: "Feature announcements" },
  { href: "/product-demo-videos",         label: "Product demos" },
];

const COMPARE_LINKS: Array<{ href: string; label: string }> = [
  { href: "/vs/loom",      label: "Videly vs Loom" },
  { href: "/vs/synthesia", label: "Videly vs Synthesia" },
  { href: "/vs/runway",    label: "Videly vs Runway" },
  { href: "/vs/pictory",   label: "Videly vs Pictory" },
  { href: "/vs/veed",      label: "Videly vs Veed" },
];

const COMPANY_LINKS: Array<{ href: string; label: string }> = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms",   label: "Terms" },
  { href: "/refund",  label: "Refund" },
  { href: "/privacy", label: "Privacy" },
];

export const MarketingShell = ({
  onCta,
  onSignIn,
  isAuthed = false,
  children,
}: {
  onCta?: () => void;
  onSignIn?: () => void;
  isAuthed?: boolean;
  children: ReactNode;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const m = useIsMobile(scrollRef, 720);

  return (
    <div
      ref={scrollRef}
      style={{
        width: "100%",
        minHeight: "100%",
        background: "var(--bg-0)",
        color: "var(--ink-0)",
        fontFamily: "'Geist', system-ui, sans-serif",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <TopNav onCta={onCta} onSignIn={onSignIn} isAuthed={isAuthed} mobile={m}/>
      <main>{children}</main>
      <MarketingFooter m={m} />
    </div>
  );
};

const MarketingFooter = ({ m }: { m: boolean }) => (
  <footer
    style={{
      borderTop: "1px solid var(--line)",
      padding: m ? "48px 20px 64px" : "72px 56px 96px",
      background: "linear-gradient(180deg, transparent, rgba(122,162,255,0.03))",
    }}
  >
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: m ? "1fr 1fr" : "2fr 1fr 1fr 1fr",
          gap: m ? 32 : 56,
          marginBottom: m ? 40 : 56,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              Videly
              <span style={{ color: "#7AA2FF", marginLeft: 2 }}>•</span>
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6, maxWidth: 360 }}>
            AI launch video generator for SaaS teams. Turn screenshots and product
            updates into motion-designed launch videos in minutes.
          </div>
        </div>

        <FooterColumn title="Use cases" links={USE_CASE_LINKS} />
        <FooterColumn title="Compare" links={COMPARE_LINKS} />
        <FooterColumn title="Company" links={COMPANY_LINKS} />
      </div>

      <div
        style={{
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
          display: "flex",
          flexDirection: m ? "column" : "row",
          justifyContent: "space-between",
          alignItems: m ? "flex-start" : "center",
          gap: 12,
          fontSize: 12,
          color: "var(--ink-3)",
        }}
      >
        <span>© 2026 Videly · AI launch video generator</span>
        <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
          Back to home →
        </a>
      </div>
    </div>
  </footer>
);

const FooterColumn = ({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) => (
  <div>
    <div
      className="mf-mono"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        color: "var(--ink-3)",
        marginBottom: 14,
      }}
    >
      {title.toUpperCase()}
    </div>
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {links.map((l) => (
        <li key={l.href}>
          <a
            href={l.href}
            style={{ color: "var(--ink-1)", textDecoration: "none", fontSize: 13.5 }}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

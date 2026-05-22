import { Link } from "react-router";
import type { ReactNode } from "react";
import { IconArrowRight, IconLogo, IconSparkle, Pill } from "../primitives";

export type LegalSection = {
  heading: string;
  body: ReactNode;
};

export const LegalScreen = ({
  eyebrow,
  title,
  lede,
  lastUpdated,
  sections,
  altDocTitle,
  altDocHref,
  onBack,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  lastUpdated: string;
  sections: LegalSection[];
  altDocTitle: string;
  altDocHref: string;
  onBack?: () => void;
}) => {
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
          <Link to="/signin" className="mf-nav-link">Sign in</Link>
          <Link to="/register" className="mf-nav-link">Create account</Link>
        </div>
      </header>

      <main
        style={{
          position: "relative",
          maxWidth: 820,
          margin: "0 auto",
          padding: "48px 24px 96px",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <Pill tone="glow" icon={<IconSparkle size={12} />}>{eyebrow}</Pill>
        </div>

        <h1 className="mf-display" style={{ fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 1.05, marginBottom: 16 }}>
          {title}
        </h1>

        <p className="mf-body" style={{ fontSize: 17, opacity: 0.78, maxWidth: 640, marginBottom: 8 }}>
          {lede}
        </p>

        <div className="mf-mono" style={{ fontSize: 11, opacity: 0.55, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Last updated · {lastUpdated}
        </div>

        <div
          style={{
            margin: "40px 0",
            height: 1,
            background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.02))",
          }}
        />

        <article style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {sections.map((s, i) => (
            <section key={s.heading} id={`s-${i + 1}`}>
              <div className="mf-eyebrow" style={{ marginBottom: 8 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <h2 className="mf-h2" style={{ marginBottom: 14, fontSize: 22 }}>
                {s.heading}
              </h2>
              <div
                className="mf-body"
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  opacity: 0.82,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {s.body}
              </div>
            </section>
          ))}
        </article>

        <div
          style={{
            marginTop: 56,
            paddingTop: 28,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="mf-mono" style={{ fontSize: 11, opacity: 0.55, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            See also
          </div>
          <Link
            to={altDocHref}
            className="mf-nav-link"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {altDocTitle}
            <IconArrowRight size={14} />
          </Link>
        </div>
      </main>
    </div>
  );
};

// Convenience for prose chunks that mix paragraphs and lists.
export const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0 }}>{children}</p>;

export const UL = ({ children }: { children: ReactNode }) => (
  <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>{children}</ul>
);

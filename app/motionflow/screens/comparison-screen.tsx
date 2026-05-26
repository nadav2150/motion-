// Generic "Videly vs <competitor>" comparison page template.
//
// Comparison pages target queries like "Loom alternative", "Synthesia vs X"
// where intent is high and the competitor's brand search volume can be
// captured. Keep tone honest — flagging competitor strengths protects the
// page from being demoted as a thin attack page, and makes the choice
// genuinely useful to the reader.

import { Button, Glass, IconArrowRight, IconCheck, IconClose, Pill, IconSparkle } from "../primitives";
import { MarketingShell } from "./marketing-shell";

export type ComparisonRow = {
  // Feature being compared.
  feature: string;
  // What Videly does. Short — fits in a table cell. "Yes" / "No" / "~ partial"
  // / a 3–5 word phrase.
  videly: string;
  // What the competitor does.
  competitor: string;
  // Optional: short note rendered as a smaller line under the cells.
  note?: string;
};

export type ComparisonPick = {
  who: string;          // "Pick Videly when…" / "Pick Loom when…"
  bullets: string[];    // 3–5 short bullets
};

export type ComparisonContent = {
  // Competitor display name. "Loom", "Synthesia", "Runway", etc.
  competitor: string;
  // <h1>. Lead with "Videly vs <competitor>" — primary keyword pattern.
  headline: string;
  // Highlighted gradient span at end of headline.
  headlineHighlight: string;
  // One-paragraph lede summarising the trade-off.
  lede: string;
  // One-sentence summary of what the competitor is best known for. Fair,
  // factual. Visible above the table.
  competitorSummary: string;
  // One-sentence summary of Videly's positioning relative to this comp.
  videlySummary: string;
  // Feature-by-feature comparison rows.
  rows: ComparisonRow[];
  // Reader-guidance: when each tool is the right pick.
  picks: [ComparisonPick, ComparisonPick]; // [videly, competitor]
  // Closing paragraph before the CTA.
  closing: string;
};

const Cell = ({ children }: { children: React.ReactNode }) => (
  <td
    style={{
      padding: "16px 18px",
      fontSize: 14,
      color: "var(--ink-1)",
      borderTop: "1px solid var(--line)",
      verticalAlign: "top",
    }}
  >
    {children}
  </td>
);

const SupportCell = ({ value }: { value: string }) => {
  // Render Yes/No/partial with an icon when the value matches; otherwise
  // just the text. Keeps the table scannable while letting routes pass
  // free-form strings for nuanced cells.
  const lower = value.trim().toLowerCase();
  if (lower === "yes" || lower === "✓") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#A6F0BD" }}>
        <IconCheck size={14}/> Yes
      </span>
    );
  }
  if (lower === "no" || lower === "✗" || lower === "—") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#FCA5A5" }}>
        <IconClose size={14}/> No
      </span>
    );
  }
  return <span>{value}</span>;
};

export const ComparisonScreen = ({
  content,
  onCta,
  onSignIn,
  isAuthed = false,
}: {
  content: ComparisonContent;
  onCta?: () => void;
  onSignIn?: () => void;
  isAuthed?: boolean;
}) => (
  <MarketingShell onCta={onCta} onSignIn={onSignIn} isAuthed={isAuthed}>
    {/* HERO */}
    <section style={{ position: "relative", padding: "72px 24px 56px", overflow: "hidden", isolation: "isolate" }}>
      <div className="mf-bg-bloom"/>
      <div className="mf-bg-grid"/>
      <div className="mf-bg-noise"/>

      <div style={{ position: "absolute", left: "8%", top: 80, width: 280, height: 280, borderRadius: "50%", background: "oklch(0.72 0.18 250 / 0.18)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }}/>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 980, margin: "0 auto", textAlign: "center" }}>
        <Pill tone="glow" icon={<IconSparkle size={11}/>}>
          <span className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
            COMPARE · VIDELY VS {content.competitor.toUpperCase()}
          </span>
        </Pill>

        <h1
          className="mf-display"
          style={{
            margin: "24px 0 18px",
            fontSize: "clamp(34px, 5.5vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
          }}
        >
          {content.headline}{" "}
          <span className="mf-grad-text">{content.headlineHighlight}</span>
        </h1>

        <p
          className="mf-body"
          style={{ maxWidth: 700, margin: "0 auto", fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6 }}
        >
          {content.lede}
        </p>
      </div>
    </section>

    {/* AT A GLANCE — two cards */}
    <section style={{ padding: "48px 24px 0" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <Glass style={{ padding: 28 }}>
          <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 12 }}>
            VIDELY
          </div>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink-1)", lineHeight: 1.6 }}>{content.videlySummary}</p>
        </Glass>
        <Glass style={{ padding: 28 }}>
          <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-3)", marginBottom: 12 }}>
            {content.competitor.toUpperCase()}
          </div>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink-1)", lineHeight: 1.6 }}>{content.competitorSummary}</p>
        </Glass>
      </div>
    </section>

    {/* COMPARISON TABLE */}
    <section style={{ padding: "72px 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>FEATURE BY FEATURE</div>
          <h2 style={{ margin: 0, fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 500, letterSpacing: "-0.03em" }}>
            How they stack up.
          </h2>
        </div>

        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--line)",
            borderRadius: 16,
            background: "rgba(8,9,13,0.5)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "16px 18px", fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-3)", fontWeight: 500 }}>
                  FEATURE
                </th>
                <th style={{ textAlign: "left", padding: "16px 18px", fontSize: 11, letterSpacing: "0.14em", color: "#7AA2FF", fontWeight: 500 }}>
                  VIDELY
                </th>
                <th style={{ textAlign: "left", padding: "16px 18px", fontSize: 11, letterSpacing: "0.14em", color: "var(--ink-3)", fontWeight: 500 }}>
                  {content.competitor.toUpperCase()}
                </th>
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, i) => (
                <tr key={i}>
                  <Cell>
                    <div style={{ fontWeight: 500, color: "var(--ink-0)" }}>{row.feature}</div>
                    {row.note && (
                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--ink-3)" }}>{row.note}</div>
                    )}
                  </Cell>
                  <Cell><SupportCell value={row.videly}/></Cell>
                  <Cell><SupportCell value={row.competitor}/></Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {/* WHEN TO PICK WHICH */}
    <section style={{ padding: "72px 24px", borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.4)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>WHICH ONE TO PICK</div>
          <h2 style={{ margin: 0, fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 500, letterSpacing: "-0.03em" }}>
            Both have their place.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {content.picks.map((p, i) => (
            <Glass key={i} style={{ padding: 28 }}>
              <div
                className="mf-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: i === 0 ? "#7AA2FF" : "var(--ink-3)",
                  marginBottom: 14,
                }}
              >
                {p.who.toUpperCase()}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {p.bullets.map((b, j) => (
                  <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--ink-1)", lineHeight: 1.55 }}>
                    <span style={{ marginTop: 7, width: 5, height: 5, borderRadius: "50%", background: i === 0 ? "#7AA2FF" : "var(--ink-3)", flexShrink: 0 }}/>
                    {b}
                  </li>
                ))}
              </ul>
            </Glass>
          ))}
        </div>
      </div>
    </section>

    {/* CLOSING + CTA */}
    <section style={{ padding: "120px 24px", borderTop: "1px solid var(--line)", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(122,162,255,0.12), transparent 70%)", pointerEvents: "none" }}/>
      <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
        <p style={{ margin: 0, fontSize: 17, color: "var(--ink-2)", lineHeight: 1.65, marginBottom: 28 }}>
          {content.closing}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>
            Try Videly free
          </Button>
          <Button variant="ghost" size="lg" onClick={onCta}>See pricing</Button>
        </div>
      </div>
    </section>
  </MarketingShell>
);

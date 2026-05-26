// Generic use-case landing page template. Each route owns its content
// (hero copy, problems-it-solves, examples, FAQ) and passes it as data —
// the screen handles layout and visual design so all use-case pages share
// the same aesthetic without duplicating chrome.
//
// SEO-relevant structure:
//   <h1> = hero headline (one per page, keyword-led)
//   <h2> = section headings (problem / solution / examples / faq)
//   Question/answer pairs render with proper semantics so Google can pull
//   them into PAA (People Also Ask) and FAQ rich results.

import { Button, Glass, IconArrowRight, Pill, IconSparkle } from "../primitives";
import { MarketingShell } from "./marketing-shell";

export type UseCaseFaq = { q: string; a: string };
export type UseCaseExample = { title: string; description: string };
export type UseCaseSolution = { title: string; description: string };

export type UseCaseContent = {
  // 11-char monospace pill above the headline. Keep keyword-led, ALL CAPS.
  eyebrow: string;
  // <h1>. Most important SEO signal. Lead with the target keyword phrase.
  headline: string;
  // Highlighted span at the end of the headline (gets the aurora gradient).
  headlineHighlight: string;
  // Lede paragraph below the headline. 150–200 chars. Should re-use the
  // primary keyword + 1–2 semantic neighbours.
  subhead: string;
  // 3–4 short bullets immediately under the hero CTA. Scannable proof.
  heroBullets: string[];
  // "Why your launch needs this" — problem framing. 1–2 paragraphs.
  problem: { heading: string; body: string };
  // "How Videly handles it" — 3–4 cards. Each card = one capability.
  solutions: UseCaseSolution[];
  // Example use cases / who this is for. 3–4 short examples.
  examples: UseCaseExample[];
  // 4–6 question-answer pairs. Triggers FAQ rich results when valid JSON-LD
  // is also emitted (added by the route, not the screen).
  faq: UseCaseFaq[];
  // Primary CTA text. Defaults to "Start free".
  ctaLabel?: string;
};

export const UseCaseScreen = ({
  content,
  onCta,
  onSignIn,
  isAuthed = false,
}: {
  content: UseCaseContent;
  onCta?: () => void;
  onSignIn?: () => void;
  isAuthed?: boolean;
}) => (
  <MarketingShell onCta={onCta} onSignIn={onSignIn} isAuthed={isAuthed}>
    {/* HERO */}
    <section style={{ position: "relative", padding: "80px 24px 96px", overflow: "hidden", isolation: "isolate" }}>
      <div className="mf-bg-bloom"/>
      <div className="mf-bg-grid"/>
      <div className="mf-bg-noise"/>

      <div style={{ position: "absolute", left: "10%", top: 140, width: 320, height: 320, borderRadius: "50%", background: "oklch(0.72 0.18 250 / 0.18)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "absolute", right: "12%", top: 60, width: 260, height: 260, borderRadius: "50%", background: "oklch(0.68 0.20 295 / 0.18)", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }}/>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 980, margin: "0 auto", textAlign: "center" }}>
        <Pill tone="glow" icon={<IconSparkle size={11}/>}>
          <span className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>{content.eyebrow}</span>
        </Pill>

        <h1
          className="mf-display"
          style={{
            margin: "24px 0 18px",
            fontSize: "clamp(36px, 6vw, 72px)",
            lineHeight: 1.04,
            letterSpacing: "-0.035em",
          }}
        >
          {content.headline}{" "}
          <span className="mf-grad-text">{content.headlineHighlight}</span>
        </h1>

        <p
          className="mf-body"
          style={{
            maxWidth: 640,
            margin: "0 auto",
            fontSize: 18,
            color: "var(--ink-2)",
            lineHeight: 1.55,
          }}
        >
          {content.subhead}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 28 }}>
          <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>
            {content.ctaLabel ?? "Start free"}
          </Button>
          <Button variant="ghost" size="lg" onClick={onCta}>See pricing</Button>
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "32px auto 0",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "10px 28px",
            maxWidth: 720,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          {content.heroBullets.map((b, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7AA2FF", boxShadow: "0 0 8px rgba(122,162,255,0.7)" }}/>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </section>

    {/* PROBLEM */}
    <section style={{ padding: "96px 24px", borderTop: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="mf-eyebrow" style={{ marginBottom: 16 }}>THE PROBLEM</div>
        <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          {content.problem.heading}
        </h2>
        <p style={{ marginTop: 24, fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6 }}>
          {content.problem.body}
        </p>
      </div>
    </section>

    {/* SOLUTIONS */}
    <section style={{ padding: "96px 24px", borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.4)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 16 }}>HOW VIDELY DOES IT</div>
          <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Built for this specific job, not a generic editor.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {content.solutions.map((s, i) => (
            <Glass key={i} style={{ padding: 28 }}>
              <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: "#7AA2FF", marginBottom: 14 }}>
                0{i + 1}
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 500, letterSpacing: "-0.015em" }}>{s.title}</h3>
              <p style={{ marginTop: 12, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>{s.description}</p>
            </Glass>
          ))}
        </div>
      </div>
    </section>

    {/* EXAMPLES */}
    <section style={{ padding: "96px 24px", borderTop: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 16 }}>WHO USES THIS</div>
          <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Examples in the wild.
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {content.examples.map((e, i) => (
            <div
              key={i}
              style={{
                padding: 24,
                borderRadius: 16,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid var(--line)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>{e.title}</h3>
              <p style={{ marginTop: 10, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>{e.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* FAQ */}
    <section style={{ padding: "96px 24px", borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.4)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="mf-eyebrow" style={{ marginBottom: 16 }}>FAQ</div>
        <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Common questions.
        </h2>

        <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 0 }}>
          {content.faq.map((item, i) => (
            <details
              key={i}
              style={{
                borderTop: "1px solid var(--line)",
                padding: "20px 0",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  color: "var(--ink-0)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {item.q}
                <span style={{ color: "var(--ink-3)", fontSize: 20, lineHeight: 1 }}>+</span>
              </summary>
              <p style={{ marginTop: 12, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.65 }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>

    {/* FINAL CTA */}
    <section style={{ padding: "120px 24px", borderTop: "1px solid var(--line)", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(122,162,255,0.12), transparent 70%)", pointerEvents: "none" }}/>
      <div style={{ position: "relative", maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ margin: 0, fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
          Ready to ship it?
        </h2>
        <p style={{ marginTop: 18, fontSize: 17, color: "var(--ink-2)" }}>
          Start free — no credit card. Generate your first video in minutes.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 28 }}>
          <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>
            {content.ctaLabel ?? "Start free"}
          </Button>
        </div>
      </div>
    </section>
  </MarketingShell>
);

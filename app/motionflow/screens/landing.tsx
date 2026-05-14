import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  Button,
  CinemaPreview,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconPlay,
  IconSparkle,
  IconWand,
  Marquee,
  Pill,
  TopNav,
  useFrame,
} from "../primitives";

const useScrollY = (ref: RefObject<HTMLDivElement | null>) => {
  const [y, setY] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setY(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  return y;
};

const FloatingCard = ({
  children,
  pos,
  delay = 0,
}: {
  children?: ReactNode;
  pos: CSSProperties;
  delay?: number;
}) => (
  <div
    className="mf-glass mf-float"
    style={{
      position: "absolute",
      ...pos,
      padding: "14px 16px",
      minWidth: 220,
      zIndex: 4,
      animationDelay: `${delay}s`,
      borderRadius: 14,
    }}
  >
    {children}
  </div>
);

/* ─────── HERO ─────── */
const HeroStage = ({ f }: { f: number; onCta?: () => void }) => {
  const scenes = [
    { c: "linear-gradient(135deg, #1F2937, #06070A)", l: "01 · COLD OPEN" },
    { c: "linear-gradient(135deg, #5468FF, #2D3340)", l: "02 · LOGO REVEAL" },
    { c: "linear-gradient(135deg, #7AA2FF, #A78BFA)", l: "03 · HERO" },
    { c: "linear-gradient(135deg, #A78BFA, #67E8F9)", l: "04 · WORKFLOW" },
    { c: "linear-gradient(135deg, #67E8F9, #7AA2FF)", l: "05 · CTA" },
  ];
  return (
    <div style={{ marginTop: 80, position: "relative" }}>
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
        <CinemaPreview aspect="2.4 / 1" frame={f} label="MOTIONFLOW · LIVE PREVIEW · 4K · 24FPS">
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", textAlign: "center", color: "white" }}>
            <div className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>SCENE 03 · 00:04.21 → 00:07.80</div>
            <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", textShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>Built for teams that ship.</div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(0deg, rgba(0,0,0,0.6), transparent)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#67E8F9", boxShadow: "0 0 16px #67E8F9" }}/>
              <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)" }}>RECORDING · MOTION ENGINE LIVE</span>
            </div>
            <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>{(8.2 + Math.sin(f / 30) * 0.6).toFixed(2)}s · {Math.round(122 + Math.sin(f / 40) * 4)} fps</div>
          </div>
        </CinemaPreview>

        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 14, background: "rgba(8,9,13,0.6)", border: "1px solid var(--line)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          {scenes.map((s, i) => (
            <div key={i} style={{ flex: 1, position: "relative" }}>
              <div style={{ height: 38, borderRadius: 6, background: s.c, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 60%)" }}/>
                {i === 2 && <div style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(122,162,255,0.7)", borderRadius: 6, boxShadow: "0 0 20px rgba(122,162,255,0.4)" }}/>}
              </div>
              <div className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 6, textAlign: "center" }}>{s.l}</div>
            </div>
          ))}
          <div style={{ position: "absolute", top: 4, bottom: 4, left: `${(((f / 4) % 100))}%`, width: 1.5, background: "#7AA2FF", boxShadow: "0 0 12px #7AA2FF", pointerEvents: "none" }}/>
        </div>
      </div>

      <FloatingCard pos={{ left: -10, top: 120 }} delay={0}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--grad-aurora)", display: "grid", placeItems: "center" }}>
            <IconWand size={14} stroke={2} style={{ color: "white" }}/>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Motion path · Easing</div>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em" }}>cubic-bezier(.2,.8,.2,1)</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 24 }}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 2, height: `${30 + Math.sin((f + i * 8) / 12) * 40 + 30}%`,
                background: i < 18 ? "linear-gradient(180deg, #7AA2FF, #A78BFA)" : "rgba(255,255,255,0.15)",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      </FloatingCard>

      <FloatingCard pos={{ right: -10, top: 200 }} delay={2}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className="mf-pill mf-pill-success" style={{ padding: "3px 8px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#67E8F9", boxShadow: "0 0 10px #67E8F9" }}/>
            LIVE
          </span>
          <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>RENDER · 4K</span>
        </div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Generating cinematic film…</div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${(Math.sin(f / 30) * 0.4 + 0.6) * 100}%`, height: "100%", background: "var(--grad-aurora)" }}/>
        </div>
        <div className="mf-mono" style={{ marginTop: 8, fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between" }}>
          <span>FRAME 1,284 / 2,160</span><span>{(8 + Math.sin(f / 30) * 1.2).toFixed(1)}s</span>
        </div>
      </FloatingCard>
    </div>
  );
};

const Hero = ({ f, y, onCta }: { f: number; y: number; onCta?: () => void }) => {
  const parallax = Math.min(y * 0.4, 200);
  return (
    <section style={{ position: "relative", padding: "32px 56px 96px", overflow: "hidden", isolation: "isolate" }}>
      <div className="mf-bg-bloom"/>
      <div className="mf-bg-grid" style={{ transform: `translateY(${parallax * 0.3}px)` }}/>
      <div className="mf-bg-noise"/>

      <div style={{ position: "absolute", left: "8%", top: 200, width: 360, height: 360, borderRadius: "50%", background: "oklch(0.72 0.18 250 / 0.20)", filter: "blur(80px)", transform: `translate(${Math.sin(f / 80) * 30}px, ${Math.cos(f / 100) * 40 - parallax * 0.5}px)`, pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "absolute", right: "10%", top: 80, width: 280, height: 280, borderRadius: "50%", background: "oklch(0.68 0.20 295 / 0.20)", filter: "blur(80px)", transform: `translate(${Math.cos(f / 70) * 40}px, ${Math.sin(f / 90) * 30 - parallax * 0.4}px)`, pointerEvents: "none", zIndex: 0 }}/>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1320, margin: "0 auto", paddingTop: 80 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 28 }}>
          <Pill tone="glow" icon={<IconSparkle size={11}/>}>
            <span className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>NEW · MOTION ENGINE v2 · CINEMATIC RENDER</span>
          </Pill>

          <h1 className="mf-display" style={{ margin: 0, maxWidth: 1100, fontSize: 96 }}>
            You bring the product.<br/>
            <span className="mf-grad-text">We bring the cinema.</span>
          </h1>

          <p className="mf-body" style={{ maxWidth: 640, fontSize: 19, color: "var(--ink-2)" }}>
            Transform screenshots, launches, and product updates into cinematic motion stories
            designed to feel world-class.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>Start Creating Free</Button>
            <Button variant="ghost" size="lg" icon={<IconPlay size={14}/>}>Watch Demo</Button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, color: "var(--ink-3)", fontSize: 13 }}>
            <div style={{ display: "flex" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i * 30}), oklch(0.55 0.18 ${280 + i * 20}))`,
                    border: "2px solid #06070A", marginLeft: i === 0 ? 0 : -8,
                  }}
                />
              ))}
            </div>
            Built for startups, founders, and product teams obsessed with taste.
          </div>
        </div>

        <HeroStage f={f} onCta={onCta}/>
      </div>
    </section>
  );
};

/* ─────── SCROLL REEL ─────── */
const ScrollReel = ({ f, y }: { f: number; y: number }) => {
  const start = 700, span = 600;
  const t = Math.max(0, Math.min(1, (y - start) / span));
  const messages = ["screen recordings.", "generic trailers.", "rushed edits.", "low-quality motion."];
  const idx = Math.min(3, Math.floor(t * 4));
  return (
    <section style={{ padding: "120px 56px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "linear-gradient(180deg, #06070A, #0A0B14)", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div className="mf-eyebrow" style={{ marginBottom: 24 }}>THE STATUS QUO</div>
          <h2 style={{ margin: 0, fontSize: 64, fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
            Product launches deserve more than{" "}
            <span style={{ background: "linear-gradient(135deg, #FF6B6B, #FCA5A5)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{messages[idx]}</span>
          </h2>
          <p style={{ marginTop: 28, fontSize: 17, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 460 }}>
            Most teams ship incredible products — then announce them with content that
            doesn't match the work that went in.
          </p>
        </div>

        <div style={{ position: "relative", height: 480 }}>
          {[
            { l: "PNG · screen-rec-final-v3.mov", c: "linear-gradient(135deg, #2A2620, #1A1812)", off: 0 },
            { l: "MP4 · launch_cut_DRAFT.mp4",   c: "linear-gradient(135deg, #1F2A2A, #0F1818)", off: 1 },
            { l: "GIF · feature_demo_v2.gif",    c: "linear-gradient(135deg, #2A1F2A, #181018)", off: 2 },
            { l: "MOV · ship_it_announce.mov",   c: "linear-gradient(135deg, #221F2A, #121018)", off: 3 },
          ].map((v, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: 30 + i * 24, left: 30 + i * 24, right: 90 - i * 22,
                height: 240,
                borderRadius: 18, overflow: "hidden",
                background: v.c, border: "1px solid var(--line-2)",
                boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
                transform: idx >= v.off ? `translate(${(v.off + 1) * 40}px, ${v.off * 8}px) rotate(${(v.off + 1) * 3}deg)` : "none",
                opacity: idx >= v.off ? 0.3 : 1,
                filter: idx >= v.off ? "blur(2px) grayscale(0.7)" : "none",
                transition: "all 800ms cubic-bezier(.2,.8,.2,1)",
                zIndex: 10 - i,
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04), transparent 60%)" }}/>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "grid", placeItems: "center", paddingLeft: 3 }}>
                  <IconPlay size={16} style={{ color: "rgba(255,255,255,0.5)" }}/>
                </div>
              </div>
              <div style={{ position: "absolute", left: 14, bottom: 10, right: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mf-mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>{v.l}</span>
                {idx >= v.off && <span style={{ fontSize: 18, color: "#FF6B6B" }}>×</span>}
              </div>
            </div>
          ))}
          <div
            style={{
              position: "absolute", inset: "60px 30px 30px 100px",
              opacity: t > 0.85 ? 1 : 0, transform: t > 0.85 ? "scale(1)" : "scale(0.92)",
              transition: "all 700ms cubic-bezier(.2,.8,.2,1)", zIndex: 20,
            }}
          >
            <CinemaPreview aspect="16 / 10" frame={f} label="MOTIONFLOW · CINEMATIC FILM"/>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────── PROBLEM BAND ─────── */
const ProblemBand = () => {
  const items = ["LAUNCHES", "PRODUCT REVEALS", "SOCIAL CONTENT", "FEATURE DROPS", "DEMOS", "ANNOUNCEMENTS"];
  return (
    <section style={{ padding: "120px 0", overflow: "hidden", borderBottom: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto 64px", padding: "0 56px", textAlign: "center" }}>
        <div className="mf-eyebrow" style={{ marginBottom: 20 }}>THE PROBLEM</div>
        <h2 style={{ margin: 0, fontSize: 72, fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.02 }}>
          Great products are still <span className="mf-grad-text">presented badly.</span>
        </h2>
      </div>

      <Marquee speed={40}>
        {items.concat(items).map((it, i) => (
          <span
            key={i}
            style={{
              fontSize: 56, fontWeight: 500, letterSpacing: "-0.02em",
              color: i % 3 === 0 ? "var(--ink-0)" : "var(--ink-4)",
              padding: "0 32px",
            }}
          >
            {it}
          </span>
        ))}
      </Marquee>

      <div style={{ maxWidth: 1100, margin: "80px auto 0", padding: "0 56px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "1px solid var(--line)", borderRadius: 18, overflow: "hidden" }}>
        {[
          { t: "Expensive",    d: "Premium motion design starts at $15K and rarely fits a launch cycle." },
          { t: "Slow",         d: "Two weeks of revisions before your launch can even ship." },
          { t: "Hard to scale", d: "Every feature needs its own brief, designer, and approval loop." },
        ].map((c, i) => (
          <div key={i} style={{ padding: "32px 28px", background: "rgba(8,9,13,0.6)", borderRight: i < 2 ? "1px solid var(--line)" : "none" }}>
            <div className="mf-mono" style={{ fontSize: 10, color: "#FF6B6B", letterSpacing: "0.16em" }}>0{i + 1}</div>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 14 }}>{c.t}</div>
            <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>{c.d}</div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 700, margin: "80px auto 0", padding: "0 56px", textAlign: "center", fontSize: 22, color: "var(--ink-2)", letterSpacing: "-0.015em" }}>
        So most companies settle for content that{" "}
        <span style={{ position: "relative" }}>
          looks forgettable.
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 6, height: 1, background: "rgba(255,107,107,0.6)" }}/>
        </span>
      </div>
    </section>
  );
};

/* ─────── SOLUTION PIPELINE ─────── */
const SolutionPipeline = ({ f }: { f: number }) => {
  const stages = [
    { l: "Scene composition", c: "linear-gradient(135deg, #5468FF, #2D3340)" },
    { l: "Cinematic pacing",  c: "linear-gradient(135deg, #7AA2FF, #5468FF)" },
    { l: "Transitions",       c: "linear-gradient(135deg, #A78BFA, #7AA2FF)" },
    { l: "Motion systems",    c: "linear-gradient(135deg, #67E8F9, #A78BFA)" },
    { l: "Captions",          c: "linear-gradient(135deg, #67E8F9, #34D399)" },
    { l: "Visual rhythm",     c: "linear-gradient(135deg, #FCD34D, #67E8F9)" },
    { l: "Storytelling flow", c: "linear-gradient(135deg, #F472B6, #FCD34D)" },
  ];
  return (
    <section style={{ padding: "140px 56px", borderBottom: "1px solid var(--line)", position: "relative" }}>
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div className="mf-eyebrow" style={{ marginBottom: 20 }}>THE SOLUTION</div>
            <h2 style={{ margin: 0, fontSize: 72, fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1.02 }}>
              Your AI <span className="mf-grad-text">motion designer.</span>
            </h2>
            <p style={{ marginTop: 28, fontSize: 18, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 480 }}>
              Upload screenshots, paste a short script, and MotionFlow AI creates launch-ready
              motion automatically.
            </p>

            <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { l: "No editing timeline" },
                { l: "No After Effects" },
                { l: "No motion designer required" },
              ].map((it, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(122,162,255,0.15)", border: "1px solid rgba(122,162,255,0.4)", display: "grid", placeItems: "center", color: "#7AA2FF" }}>
                    <IconClose size={11}/>
                  </div>
                  <span style={{ fontSize: 15, color: "var(--ink-1)" }}>{it.l}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: "relative", padding: "32px 28px", borderRadius: 24, background: "rgba(8,9,13,0.5)", border: "1px solid var(--line)", backdropFilter: "blur(40px)", overflow: "hidden" }}>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em", marginBottom: 18 }}>MOTIONFLOW PIPELINE · LIVE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stages.map((s, i) => {
                const phase = (f / 6 + i * 0.5) % stages.length;
                const active = Math.floor(phase) === 0;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 14px", borderRadius: 10,
                      background: active ? "rgba(122,162,255,0.08)" : "rgba(255,255,255,0.025)",
                      border: `1px solid ${active ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
                      transition: "all 600ms",
                    }}
                  >
                    <div style={{ width: 36, height: 24, borderRadius: 5, background: s.c, flexShrink: 0 }}/>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{s.l}</div>
                    <div style={{ flex: 1.2, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${40 + Math.abs(Math.sin((f + i * 30) / 40)) * 55}%`, height: "100%", background: "var(--grad-aurora)" }}/>
                    </div>
                    <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", minWidth: 36, textAlign: "right" }}>
                      {Math.round(60 + Math.abs(Math.sin((f + i * 30) / 40)) * 38)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────── HOW IT WORKS ─────── */
const UploadVisual = ({ f }: { f: number }) => (
  <div style={{ position: "relative", height: "100%", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
    {Array.from({ length: 8 }).map((_, i) => {
      const hue = 220 + (i * 22) % 90;
      const lift = Math.sin((f + i * 20) / 40) * 4;
      return (
        <div
          key={i}
          style={{
            borderRadius: 8,
            background: `linear-gradient(135deg, oklch(0.5 0.12 ${hue}), oklch(0.25 0.08 ${hue + 30}))`,
            border: "1px solid rgba(255,255,255,0.08)",
            transform: `translateY(${lift}px)`,
            transition: "transform 200ms",
          }}
        />
      );
    })}
  </div>
);

const ScriptVisual = () => (
  <div style={{ height: "100%", padding: "16px 18px", borderRadius: 12, background: "rgba(0,0,0,0.35)", border: "1px solid var(--line)", fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-2)", lineHeight: 1.7, overflow: "hidden" }}>
    <div style={{ color: "var(--ink-3)" }}>// release-notes.md</div>
    <div><span style={{ color: "#7AA2FF" }}>#</span> Lattice 4.0</div>
    <div><span style={{ color: "#A78BFA" }}>-</span> Goals that update themselves</div>
    <div><span style={{ color: "#A78BFA" }}>-</span> AI 1:1 prep, in seconds</div>
    <div><span style={{ color: "#A78BFA" }}>-</span> Real-time pulse signals</div>
    <div style={{ marginTop: 8, color: "var(--ink-3)" }}># cta</div>
    <div>Built for teams that ship.</div>
  </div>
);

const GenerateVisual = ({ f }: { f: number }) => (
  <div style={{ position: "relative", height: "100%", borderRadius: 12, overflow: "hidden", background: "linear-gradient(135deg, #1F2937, #06070A)", border: "1px solid var(--line)" }}>
    <div style={{ position: "absolute", inset: 0 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute", borderRadius: "50%", filter: "blur(40px)",
            width: "60%", height: "100%",
            background: ["oklch(0.72 0.18 250 / 0.6)", "oklch(0.68 0.20 295 / 0.5)", "oklch(0.85 0.14 210 / 0.4)"][i],
            left: `${20 + Math.sin((f + i * 50) / 40) * 30}%`,
            top: `${10 + Math.cos((f + i * 40) / 35) * 20}%`,
          }}
        />
      ))}
    </div>
    <div style={{ position: "absolute", left: 14, bottom: 10, display: "flex", alignItems: "center", gap: 8, color: "white" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#67E8F9", boxShadow: "0 0 10px #67E8F9" }}/>
      <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)" }}>RENDERING · {Math.round(60 + Math.sin(f / 30) * 30)}%</span>
    </div>
  </div>
);

const ExportVisual = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, height: "100%" }}>
    {["X", "in", "PH", "App Store", "Web", "Ads"].map((l, i) => (
      <div
        key={i}
        style={{
          borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)",
          display: "grid", placeItems: "center", fontSize: 12, fontWeight: 500, color: "var(--ink-2)",
        }}
      >
        {l}
      </div>
    ))}
  </div>
);

const HowItWorks = ({ f }: { f: number }) => {
  const steps = [
    { n: "01", t: "Upload your product",   d: "Drop screenshots, UI flows, or product URLs.",                                                        visual: <UploadVisual f={f}/> },
    { n: "02", t: "Tell the story",        d: "Add a short script, release notes, or feature bullets.",                                               visual: <ScriptVisual/> },
    { n: "03", t: "Generate cinematic motion", d: "MotionFlow AI builds scenes, transitions, pacing, and animations automatically.",                  visual: <GenerateVisual f={f}/> },
    { n: "04", t: "Export everywhere",     d: "Publish launch-ready content for X, LinkedIn, Product Hunt, App Store, websites, and ads.",            visual: <ExportVisual/> },
  ];
  return (
    <section style={{ padding: "140px 56px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 80 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 20 }}>HOW IT WORKS</div>
          <h2 style={{ margin: 0, fontSize: 64, fontWeight: 500, letterSpacing: "-0.035em" }}>
            From product to film in <span className="mf-grad-text">four moves.</span>
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 32, alignItems: "center",
                padding: "32px 36px", borderRadius: 18,
                background: "rgba(8,9,13,0.5)", border: "1px solid var(--line)",
              }}
            >
              <div className="mf-mono" style={{ fontSize: 56, fontWeight: 500, color: "var(--ink-3)", letterSpacing: "-0.04em" }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>{s.t}</div>
                <div style={{ marginTop: 10, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 420 }}>{s.d}</div>
              </div>
              <div style={{ height: 160 }}>{s.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────── TASTE ─────── */
const TasteSection = () => (
  <section style={{ padding: "160px 56px", borderBottom: "1px solid var(--line)", textAlign: "center", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 80% at 50% 50%, rgba(122,162,255,0.10), transparent 70%)", pointerEvents: "none" }}/>
    <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto" }}>
      <div className="mf-eyebrow" style={{ marginBottom: 24 }}>THE DIFFERENCE</div>
      <h2 style={{ margin: 0, fontSize: 88, fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.0 }}>
        Most AI tools generate <span style={{ color: "var(--ink-3)" }}>content.</span><br/>
        MotionFlow generates <span className="mf-grad-text">taste.</span>
      </h2>
      <p style={{ marginTop: 36, fontSize: 18, color: "var(--ink-2)", maxWidth: 620, margin: "36px auto 0", lineHeight: 1.55 }}>
        Built around curated motion systems inspired by modern startup launches, cinematic
        product reveals, and premium UI storytelling.
      </p>

      <div style={{ marginTop: 56, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
        {["Not AI slop", "Not random animations", "Not template videos"].map((l, i) => (
          <div
            key={i}
            style={{
              padding: "12px 22px", borderRadius: 999,
              background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
              fontSize: 14, color: "var(--ink-2)",
              display: "inline-flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,107,107,0.6)" }}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ─────── PRESET GALLERY ─────── */
const LinearMotion = ({ f }: { f: number }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        style={{
          position: "absolute", left: 0, right: 0, height: 1, top: `${20 + i * 15}%`,
          background: "rgba(255,255,255,0.4)",
          transform: `translateX(${Math.sin((f + i * 30) / 30) * 30}%)`,
        }}
      />
    ))}
  </div>
);
const AppleMotion = ({ f }: { f: number }) => (
  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
    <div
      style={{
        width: `${50 + Math.sin(f / 40) * 8}%`, aspectRatio: 1, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.4), rgba(255,255,255,0) 60%)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    />
  </div>
);
const HyperMotion = ({ f }: { f: number }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    {Array.from({ length: 14 }).map((_, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${(i * 7 + f / 2) % 100}%`, top: `${10 + (i * 13) % 80}%`,
          width: 30, height: 1.5, background: "rgba(255,255,255,0.7)",
          transform: "rotate(-25deg)",
        }}
      />
    ))}
  </div>
);
const GlassMotion = ({ f }: { f: number }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          position: "absolute", inset: `${10 + i * 10}%`, borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.18)",
          transform: `rotate(${Math.sin((f + i * 40) / 50) * 8}deg)`,
          transition: "transform 200ms",
        }}
      />
    ))}
  </div>
);
const NoirMotion = ({ f }: { f: number }) => (
  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${f % 360}deg, rgba(252,211,77,0) 40%, rgba(252,211,77,0.5) 50%, rgba(252,211,77,0) 60%)` }}/>
);

const PresetGallery = ({ f }: { f: number }) => {
  const presets = [
    { n: "Linear", d: "Minimal, sharp, technical motion.",     c: "linear-gradient(135deg, #5468FF, #1F2937)", accent: "#7AA2FF" },
    { n: "Apple",  d: "Elegant pacing with cinematic reveals.", c: "linear-gradient(135deg, #1F2937, #000)",     accent: "#FAFAFC" },
    { n: "Hyper",  d: "Fast, energetic, launch-first motion.",  c: "linear-gradient(135deg, #F472B6, #7AA2FF)",  accent: "#F472B6" },
    { n: "Glass",  d: "Soft gradients, layered depth.",          c: "linear-gradient(135deg, #67E8F9, #A78BFA)",  accent: "#67E8F9" },
    { n: "Noir",   d: "Dark, dramatic, contrast-heavy.",         c: "linear-gradient(135deg, #1A1A1A, #000)",     accent: "#FCD34D" },
  ];
  return (
    <section style={{ padding: "140px 56px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56 }}>
          <div>
            <div className="mf-eyebrow" style={{ marginBottom: 20 }}>MOTION PRESETS</div>
            <h2 style={{ margin: 0, fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Designed like <span className="mf-grad-text">creative identities.</span>
            </h2>
          </div>
          <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.16em" }}>05 · STYLE SYSTEMS</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          {presets.map((p, i) => (
            <div
              key={i}
              style={{
                borderRadius: 18, overflow: "hidden",
                background: "rgba(8,9,13,0.6)", border: "1px solid var(--line)",
                transition: "all 280ms cubic-bezier(.2,.8,.2,1)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = `${p.accent}66`;
                e.currentTarget.style.boxShadow = `0 30px 60px -20px ${p.accent}40`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div style={{ aspectRatio: "4/5", background: p.c, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0 }}>
                  {p.n === "Linear" && <LinearMotion f={f}/>}
                  {p.n === "Apple"  && <AppleMotion f={f}/>}
                  {p.n === "Hyper"  && <HyperMotion f={f}/>}
                  {p.n === "Glass"  && <GlassMotion f={f}/>}
                  {p.n === "Noir"   && <NoirMotion f={f}/>}
                </div>
                <div style={{ position: "absolute", left: 14, top: 14, padding: "4px 8px", borderRadius: 5, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", fontSize: 10, color: "white", letterSpacing: "0.06em", fontWeight: 500 }}>0{i + 1}</div>
              </div>
              <div style={{ padding: "20px 18px" }}>
                <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em", color: p.accent }}>{p.n}</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.45 }}>{p.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────── USE CASES ─────── */
const UseCaseGrid = () => {
  const cases = [
    { t: "Launch Videos",      d: "Turn feature launches into cinematic reveals." },
    { t: "Product Updates",    d: "Transform release notes into engaging motion content." },
    { t: "Founder Marketing",  d: "Create premium social content without a creative team." },
    { t: "SaaS Storytelling",  d: "Show your product like world-class companies do." },
    { t: "App Store Videos",   d: "Generate polished previews optimized for conversion." },
    { t: "Onboarding Visuals", d: "Welcome new users with motion that feels considered." },
  ];
  return (
    <section style={{ padding: "140px 56px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56 }}>
          <h2 style={{ margin: 0, fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 600 }}>
            One tool. Every <span className="mf-grad-text">launch surface.</span>
          </h2>
          <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.16em" }}>USE CASES</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 18, overflow: "hidden" }}>
          {cases.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "36px 32px", background: "rgba(8,9,13,0.6)",
                display: "flex", flexDirection: "column", gap: 12,
                minHeight: 220, position: "relative", cursor: "pointer", transition: "background 200ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(122,162,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(8,9,13,0.6)"; }}
            >
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em" }}>0{i + 1}</div>
              <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{c.t}</div>
              <div className="mf-body" style={{ fontSize: 14, color: "var(--ink-3)", marginTop: "auto" }}>{c.d}</div>
              <IconArrowRight size={14} style={{ position: "absolute", right: 28, bottom: 32, color: "var(--ink-3)" }}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─────── WHY NOW ─────── */
const WhyNow = ({ f }: { f: number }) => {
  const beats = ["narratives", "reveals", "moments", "motion", "atmosphere"];
  const demand = ["launch videos", "social clips", "product storytelling", "feature demos", "ads", "onboarding visuals"];
  return (
    <section style={{ padding: "140px 56px", borderBottom: "1px solid var(--line)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% 50%, rgba(167,139,250,0.08), transparent 70%)" }}/>
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
        <div className="mf-eyebrow" style={{ marginBottom: 20 }}>WHY NOW</div>
        <h2 style={{ margin: 0, fontSize: 88, fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.0 }}>
          Software became <span className="mf-grad-text">visual.</span>
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, marginTop: 80 }}>
          <div>
            <div style={{ fontSize: 16, color: "var(--ink-3)", marginBottom: 24, letterSpacing: "-0.005em" }}>The best startups no longer just ship features. They ship:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {beats.map((b, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em",
                    color: i === Math.floor(f / 40) % beats.length ? "var(--ink-0)" : "var(--ink-3)",
                    transition: "color 400ms",
                  }}
                >
                  {b}.
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 16, color: "var(--ink-3)", marginBottom: 24, letterSpacing: "-0.005em" }}>And content demand exploded. Teams now need:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {demand.map((d, i) => (
                <span
                  key={i}
                  style={{
                    padding: "10px 16px", borderRadius: 999,
                    background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
                    fontSize: 14, color: "var(--ink-1)",
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 32, fontSize: 16, color: "var(--ink-2)", lineHeight: 1.6 }}>
              Every single week.
            </div>
            <div style={{ marginTop: 12, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>
              MotionFlow makes cinematic startup storytelling <span className="mf-grad-text">scalable.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────── BUILT FOR ─────── */
const BuiltFor = () => {
  const groups = ["founders", "indie hackers", "SaaS teams", "product marketers", "agencies", "launch-obsessed startups"];
  return (
    <section style={{ padding: "120px 0", borderBottom: "1px solid var(--line)", overflow: "hidden", textAlign: "center" }}>
      <div style={{ maxWidth: 900, margin: "0 auto 56px", padding: "0 56px" }}>
        <div className="mf-eyebrow" style={{ marginBottom: 20 }}>SOCIAL PROOF</div>
        <h2 style={{ margin: 0, fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
          Built for the new generation of <span className="mf-grad-text">startup marketing.</span>
        </h2>
      </div>
      <Marquee speed={50}>
        {groups.concat(groups).map((g, i) => (
          <span
            key={i}
            style={{
              fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em",
              color: i % 2 === 0 ? "var(--ink-1)" : "var(--ink-3)",
              padding: "0 28px",
            }}
          >
            {g} <span style={{ color: "var(--ink-4)", margin: "0 4px" }}>·</span>
          </span>
        ))}
      </Marquee>
    </section>
  );
};

/* ─────── PRICING ─────── */
type Tier = {
  n: string;
  price: number | null;
  priceLabel?: string;
  sub: string;
  desc: string;
  cta: string;
  variant: "primary" | "ghost";
  accent: string;
  featured?: boolean;
  badge?: string;
  bg: string;
  heading?: string;
  features: string[];
};

const PricingTable = () => {
  const cols = ["Free", "Pro", "Studio", "Enterprise"];
  const rows: [string, string[]][] = [
    ["AI Scene Generation",      ["✓", "✓", "✓", "✓"]],
    ["Cinematic Motion Systems", ["Basic", "Premium", "Advanced", "Custom"]],
    ["Watermark-Free Export",    ["—", "✓", "✓", "✓"]],
    ["HD Export",                ["—", "✓", "✓", "✓"]],
    ["AI Storyboard Engine",     ["—", "✓", "✓", "✓"]],
    ["Smart Pacing",             ["—", "✓", "✓", "✓"]],
    ["Brand Kit",                ["—", "✓", "✓", "✓"]],
    ["Team Collaboration",       ["—", "—", "✓", "✓"]],
    ["Custom Motion Identity",   ["—", "—", "✓", "✓"]],
    ["API Access",               ["—", "—", "—", "✓"]],
    ["White-Label",              ["—", "—", "—", "✓"]],
  ];
  const accents = ["rgba(255,255,255,0.4)", "#7AA2FF", "#A78BFA", "#67E8F9"];

  const Cell = ({ v, accent, featured }: { v: string; accent: string; featured?: boolean }) => {
    const isCheck = v === "✓";
    const isDash = v === "—";
    return (
      <div
        style={{
          padding: "16px 20px", textAlign: "center",
          background: featured ? "rgba(122,162,255,0.04)" : "transparent",
          fontSize: 13, color: isDash ? "var(--ink-4)" : "var(--ink-1)",
          display: "flex", justifyContent: "center", alignItems: "center",
        }}
      >
        {isCheck ? (
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: `${accent}20`, border: `1px solid ${accent}55`, display: "grid", placeItems: "center", color: accent }}>
            <IconCheck size={10} stroke={2.5}/>
          </span>
        ) : isDash ? (
          <span style={{ width: 12, height: 1, background: "var(--ink-4)" }}/>
        ) : (
          <span style={{ fontSize: 12, color: accent, fontWeight: 500, letterSpacing: "-0.005em" }}>{v}</span>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr)" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
        <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em" }}>FEATURES</span>
      </div>
      {cols.map((c, i) => (
        <div
          key={i}
          style={{
            padding: "20px 16px", textAlign: "center",
            borderBottom: "1px solid var(--line)",
            background: i === 1 ? "rgba(122,162,255,0.06)" : "transparent",
            borderLeft: "1px solid var(--line)",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accents[i] }}/>
            <span style={{ fontSize: 13, fontWeight: 500, color: accents[i], letterSpacing: "-0.005em" }}>{c}</span>
          </div>
        </div>
      ))}

      {rows.map(([label, vals], rIdx) => (
        <Fragment key={rIdx}>
          <div
            style={{
              padding: "16px 24px", fontSize: 14, color: "var(--ink-1)",
              borderTop: rIdx === 0 ? "none" : "1px solid var(--line-2)",
              display: "flex", alignItems: "center",
            }}
          >
            {label}
          </div>
          {vals.map((v, cIdx) => (
            <div
              key={cIdx}
              style={{
                borderTop: rIdx === 0 ? "none" : "1px solid var(--line-2)",
                borderLeft: "1px solid var(--line)",
              }}
            >
              <Cell v={v} accent={accents[cIdx]} featured={cIdx === 1}/>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
};

const Pricing = ({ f, onCta }: { f: number; onCta?: () => void }) => {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const mult = billing === "annual" ? 0.8 : 1;
  const tiers: Tier[] = [
    {
      n: "Free", price: 0, sub: "Perfect for exploring MotionFlow AI",
      desc: "Create your first cinematic launch videos in minutes.",
      cta: "Start Free", variant: "ghost",
      accent: "rgba(255,255,255,0.4)",
      bg: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
      features: ["3 video exports / month", "MotionFlow watermark", "720p export", "Basic cinematic styles", "AI scene generation", "Auto captions", "Social export presets", "Community templates"],
    },
    {
      n: "Pro", price: 39, sub: "For founders and startups moving fast",
      desc: "Premium launch videos, product reveals, and social content — without a motion team.",
      cta: "Start Pro", variant: "primary",
      accent: "#7AA2FF", featured: true, badge: "MOST POPULAR",
      bg: "linear-gradient(180deg, oklch(0.30 0.13 250 / 0.55), oklch(0.18 0.10 290 / 0.35))",
      features: ["Unlimited exports", "No watermark", "Full HD cinematic export", "Premium motion systems", "AI storyboard engine", "Smart pacing & transitions", "Brand kit", "Auto captions & sync", "Social aspect ratios", "Faster rendering", "Commercial usage", "Priority generation queue"],
    },
    {
      n: "Studio", price: 99, sub: "Your startup's cinematic content engine",
      desc: "Built for teams producing launch content every week.",
      cta: "Start Studio", variant: "ghost",
      accent: "#A78BFA",
      bg: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
      heading: "Everything in Pro, plus",
      features: ["Team collaboration", "Shared brand workspace", "Advanced cinematic styles", "Reusable launch templates", "AI creative direction", "Audio-reactive motion", "Advanced pacing control", "Premium typography systems", "Custom motion identity", "Priority rendering", "Unlimited brand presets", "Private projects"],
    },
    {
      n: "Enterprise", price: null, priceLabel: "Custom", sub: "Motion infrastructure for modern brands",
      desc: "Custom cinematic systems for high-scale product marketing teams.",
      cta: "Contact Sales", variant: "ghost",
      accent: "#67E8F9",
      bg: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))",
      features: ["Dedicated rendering infrastructure", "API access", "White-label workflows", "Custom motion systems", "Brand-trained creative engine", "Internal creative automation", "Multi-team workspaces", "Enterprise onboarding", "Dedicated support"],
    },
  ];

  return (
    <section style={{ padding: "160px 56px", borderBottom: "1px solid var(--line)", position: "relative", overflow: "hidden" }}>
      <div className="mf-bg-bloom"/>
      <div style={{ position: "absolute", left: "10%", top: 200, width: 400, height: 400, borderRadius: "50%", background: "oklch(0.72 0.18 250 / 0.12)", filter: "blur(100px)", transform: `translate(${Math.sin(f / 80) * 30}px, ${Math.cos(f / 100) * 40}px)`, pointerEvents: "none" }}/>
      <div style={{ position: "absolute", right: "8%", top: 600, width: 320, height: 320, borderRadius: "50%", background: "oklch(0.68 0.20 295 / 0.12)", filter: "blur(100px)", transform: `translate(${Math.cos(f / 70) * 40}px, ${Math.sin(f / 90) * 30}px)`, pointerEvents: "none" }}/>

      <div style={{ position: "relative", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 20 }}>PRICING</div>
          <h2 style={{ margin: 0, fontSize: 80, fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.0 }}>
            Pricing built for <span className="mf-grad-text">teams that ship.</span>
          </h2>
          <p style={{ marginTop: 24, fontSize: 18, color: "var(--ink-2)", maxWidth: 580, margin: "24px auto 0", lineHeight: 1.55 }}>
            From first launch videos to full-scale cinematic product storytelling.
          </p>

          <div style={{ marginTop: 40, display: "inline-flex", padding: 4, borderRadius: 999, background: "rgba(8,9,13,0.6)", border: "1px solid var(--line)", backdropFilter: "blur(20px)" }}>
            {([
              { k: "monthly" as const, l: "Monthly" },
              { k: "annual" as const,  l: "Annual", hint: "−20%" },
            ]).map((b) => (
              <button
                key={b.k}
                onClick={() => setBilling(b.k)}
                style={{
                  padding: "10px 22px", borderRadius: 999, border: "none", cursor: "pointer",
                  background: billing === b.k ? "var(--grad-aurora)" : "transparent",
                  color: billing === b.k ? "white" : "var(--ink-2)",
                  fontSize: 13, fontWeight: 500, letterSpacing: "-0.005em",
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  transition: "all 200ms",
                }}
              >
                {b.l}
                {b.hint && <span className="mf-mono" style={{ fontSize: 10, opacity: billing === b.k ? 0.85 : 0.5, letterSpacing: "0.06em" }}>{b.hint}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {tiers.map((t, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                padding: t.featured ? 1.5 : 1,
                borderRadius: 22,
                background: t.featured
                  ? "linear-gradient(180deg, rgba(122,162,255,0.5), rgba(167,139,250,0.2) 60%, rgba(122,162,255,0.05))"
                  : "var(--line)",
                transform: t.featured ? "translateY(-8px)" : "none",
              }}
            >
              {t.badge && (
                <div
                  style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    padding: "5px 12px", borderRadius: 999,
                    background: "var(--grad-aurora)", color: "white",
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.14em",
                    fontFamily: "'Geist Mono', monospace",
                    boxShadow: "0 8px 24px -6px rgba(122,162,255,0.6)",
                    zIndex: 2,
                  }}
                >
                  {t.badge}
                </div>
              )}

              <div
                style={{
                  position: "relative",
                  borderRadius: 21,
                  background: t.bg,
                  backdropFilter: "blur(40px)",
                  padding: "36px 28px 32px",
                  display: "flex", flexDirection: "column", height: "100%",
                  overflow: "hidden",
                  minHeight: 720,
                }}
              >
                {t.featured && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(circle at 50% 0%, ${t.accent}25, transparent 60%)` }}/>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.accent, boxShadow: t.featured ? `0 0 16px ${t.accent}` : "none" }}/>
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.accent, letterSpacing: "-0.005em" }}>{t.n}</span>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                  {t.price === null ? (
                    <span style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.04em", color: "var(--ink-0)" }}>{t.priceLabel}</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.04em", color: "var(--ink-0)" }}>
                        ${Math.round(t.price * mult)}
                      </span>
                      {t.price > 0 && <span style={{ fontSize: 14, color: "var(--ink-3)" }}>/mo</span>}
                    </>
                  )}
                </div>

                <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 14, minHeight: 18 }}>{t.sub}</div>

                <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 24, minHeight: 64 }}>{t.desc}</div>

                <Button
                  variant={t.variant === "primary" ? "primary" : "ghost"}
                  size="md"
                  onClick={t.n === "Enterprise" ? undefined : onCta}
                  iconRight={<IconArrowRight size={14}/>}
                >
                  {t.cta}
                </Button>

                <div style={{ height: 1, background: "var(--line)", margin: "24px 0 20px" }}/>

                <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em", marginBottom: 14, textTransform: "uppercase" }}>
                  {t.heading || "Includes"}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                  {t.features.map((feat, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--ink-1)", lineHeight: 1.45 }}>
                      <span
                        style={{
                          marginTop: 5, flexShrink: 0,
                          width: 14, height: 14, borderRadius: "50%",
                          background: t.featured ? `${t.accent}25` : "rgba(255,255,255,0.05)",
                          border: `1px solid ${t.featured ? `${t.accent}50` : "var(--line)"}`,
                          display: "grid", placeItems: "center",
                          color: t.accent,
                        }}
                      >
                        <IconCheck size={8} stroke={2.5}/>
                      </span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 96 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="mf-eyebrow" style={{ marginBottom: 16 }}>COMPARE</div>
            <h3 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em" }}>Every feature, side by side.</h3>
          </div>

          <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)", background: "rgba(8,9,13,0.55)", backdropFilter: "blur(40px)" }}>
            <PricingTable/>
          </div>
        </div>

        <div style={{ marginTop: 96, textAlign: "center", padding: "72px 56px", borderRadius: 24, background: "rgba(8,9,13,0.5)", border: "1px solid var(--line)" }}>
          <h3 style={{ margin: "0 auto", fontSize: 48, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 720 }}>
            Your product already deserves <span className="mf-grad-text">world-class storytelling.</span>
          </h3>
          <p style={{ marginTop: 20, fontSize: 16, color: "var(--ink-2)", maxWidth: 560, margin: "20px auto 0", lineHeight: 1.55 }}>
            MotionFlow AI helps startups create cinematic launch content without agencies, editors, or motion designers.
          </p>
          <div style={{ marginTop: 32 }}>
            <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>Start Creating Free</Button>
          </div>
          <div className="mf-mono" style={{ marginTop: 28, fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.16em" }}>
            YOU BRING THE PRODUCT · WE BRING THE CINEMA
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─────── FINAL CTA ─────── */
const FinalCta = ({ f, onCta }: { f: number; onCta?: () => void }) => (
  <section style={{ padding: "160px 56px", position: "relative", overflow: "hidden" }}>
    <div className="mf-bg-bloom"/>
    <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
      <div
        style={{
          position: "relative", borderRadius: 32, overflow: "hidden",
          background: "linear-gradient(135deg, oklch(0.30 0.12 250), oklch(0.18 0.10 290))",
          border: "1px solid rgba(122,162,255,0.30)",
          padding: "96px 64px",
          boxShadow: "0 60px 140px -40px rgba(122,162,255,0.5)",
        }}
      >
        <div style={{ position: "absolute", left: "-10%", top: "-30%", width: "70%", height: "120%", borderRadius: "50%", filter: "blur(80px)", background: "oklch(0.72 0.18 250 / 0.6)", transform: `translate(${Math.sin(f / 60) * 30}px, ${Math.cos(f / 80) * 20}px)` }}/>
        <div style={{ position: "absolute", right: "-15%", top: "-20%", width: "60%", height: "120%", borderRadius: "50%", filter: "blur(80px)", background: "oklch(0.68 0.20 295 / 0.5)", transform: `translate(${Math.cos(f / 70) * 40}px, ${Math.sin(f / 90) * 30}px)` }}/>

        <div style={{ position: "relative", textAlign: "center" }}>
          <div className="mf-mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em", marginBottom: 20 }}>FINAL · 00:60</div>
          <h2 style={{ margin: 0, fontSize: 80, fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 1.0, color: "white" }}>
            Your product already looks good.<br/>
            <span style={{ background: "linear-gradient(135deg, #FFFFFF, rgba(255,255,255,0.5))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Now make it unforgettable.</span>
          </h2>
          <p style={{ marginTop: 28, fontSize: 19, color: "rgba(255,255,255,0.70)", maxWidth: 560, margin: "28px auto 0" }}>
            Create cinematic launch videos in minutes.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 40 }}>
            <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>Start Creating Free</Button>
            <Button variant="ghost" size="lg" icon={<IconPlay size={14}/>}>See MotionFlow in Action</Button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const FootRule = () => (
  <footer style={{ padding: "56px 56px 80px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1320, margin: "0 auto", color: "var(--ink-3)", fontSize: 13 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, fontWeight: 600 }}>M<span style={{ color: "#7AA2FF" }}>•</span></span>
      <span>MotionFlow AI · 2026</span>
    </div>
    <div style={{ display: "flex", gap: 28 }}>
      <span>Pricing</span><span>Docs</span><span>Changelog</span><span>Privacy</span>
    </div>
  </footer>
);

export const LandingScreen = ({
  onCta,
  onSignIn,
}: {
  onCta?: () => void;
  onSignIn?: () => void;
}) => {
  const f = useFrame();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const y = useScrollY(scrollRef);

  return (
    <div
      ref={scrollRef}
      style={{
        width: "100%", height: "100%", overflow: "auto",
        background: "var(--bg-0)", color: "var(--ink-0)",
        fontFamily: "'Geist', system-ui, sans-serif",
        position: "relative",
      }}
    >
      <TopNav onCta={onCta} onSignIn={onSignIn}/>

      <Hero f={f} y={y} onCta={onCta}/>
      <ScrollReel f={f} y={y}/>
      <ProblemBand/>
      <SolutionPipeline f={f}/>
      <HowItWorks f={f}/>
      <TasteSection/>
      <PresetGallery f={f}/>
      <UseCaseGrid/>
      <WhyNow f={f}/>
      <BuiltFor/>
      <Pricing f={f} onCta={onCta}/>
      <FinalCta f={f} onCta={onCta}/>
      <FootRule/>
    </div>
  );
};

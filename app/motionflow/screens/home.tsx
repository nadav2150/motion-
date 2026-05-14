import { useState } from "react";
import {
  AppChrome,
  Button,
  CinemaPreview,
  IconArrowRight,
  IconPlay,
  IconSparkle,
  IconUpload,
  Pill,
  useFrame,
  type NavKey,
} from "../primitives";

type Template = { t: string; d: string; c: string; tag?: string };

export const HomeScreen = ({
  onNav,
  onPickTemplate,
  onNewBlank,
}: {
  onNav?: (k: NavKey) => void;
  onPickTemplate?: () => void;
  onNewBlank?: () => void;
}) => {
  const f = useFrame();
  const cats = ["All", "Product launch", "Feature reveal", "Funding", "Recap", "Social reel"];
  const [cat, setCat] = useState("All");

  const templates: Template[] = [
    { t: "Linear-style hero",     d: "Crisp · 45s",  c: "linear-gradient(135deg, #5468FF, #2D3340)", tag: "Most popular" },
    { t: "Apple cinematic",       d: "Soft · 60s",   c: "linear-gradient(135deg, #1F2937, #000)" },
    { t: "Hype announcement",     d: "Bold · 30s",   c: "linear-gradient(135deg, #F472B6, #7AA2FF)" },
    { t: "Vertical reel",         d: "9:16 · 15s",   c: "linear-gradient(135deg, #67E8F9, #7AA2FF)" },
    { t: "Funding announcement",  d: "Soft · 50s",   c: "linear-gradient(135deg, #A78BFA, #67E8F9)" },
    { t: "Quarterly recap",       d: "Linear · 90s", c: "linear-gradient(135deg, #1F2937, #5468FF)" },
    { t: "Feature deep-dive",     d: "Apple · 75s",  c: "linear-gradient(135deg, #2D3340, #7AA2FF)" },
    { t: "Customer story",        d: "Soft · 60s",   c: "linear-gradient(135deg, #7AA2FF, #F472B6)" },
  ];

  return (
    <AppChrome
      active="home"
      onNav={onNav}
      project="Home"
      right={
        <>
          <Button variant="ghost" size="sm" icon={<IconUpload size={12}/>}>Import</Button>
          <Button variant="primary" size="sm" onClick={onNewBlank ?? onPickTemplate} iconRight={<IconArrowRight size={14}/>}>New from blank</Button>
        </>
      }
    >
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: "48px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>WORKSPACE · LATTICE</div>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: 44 }}>
            Start from a <span className="mf-grad-text">template.</span>
          </h1>
          <div className="mf-body" style={{ marginTop: 10, fontSize: 15, color: "var(--ink-2)", maxWidth: 620 }}>
            Hand-tuned by motion designers. Drop in your screenshots and script — we'll do the rest.
          </div>
        </div>

        {/* Featured */}
        <div onClick={onPickTemplate} style={{ position: "relative", marginBottom: 36, cursor: "pointer" }}>
          <CinemaPreview aspect="2.4 / 1" frame={f} label="FEATURED · LINEAR-STYLE LAUNCH">
            <div style={{ position: "absolute", left: 36, bottom: 36, right: 36, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <Pill tone="glow" icon={<IconSparkle size={11}/>}>
                  <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>FEATURED</span>
                </Pill>
                <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 14, color: "white" }}>The launch film, in 45 seconds.</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>6 scenes · Linear preset · 4K · drag-drop ready</div>
              </div>
              <Button variant="primary" size="md" iconRight={<IconArrowRight size={14}/>}>Use template</Button>
            </div>
          </CinemaPreview>
        </div>

        {/* Categories */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                background: cat === c ? "rgba(255,255,255,0.08)" : "transparent",
                border: `1px solid ${cat === c ? "var(--line-2)" : "var(--line)"}`,
                color: cat === c ? "var(--ink-0)" : "var(--ink-2)",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {templates.map((tp, i) => (
            <button
              key={i}
              onClick={onPickTemplate}
              style={{
                padding: 0, borderRadius: 14, overflow: "hidden",
                background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = "var(--line-2)";
                e.currentTarget.style.boxShadow = "0 20px 40px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.10)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div style={{ aspectRatio: "16/10", background: tp.c, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 55%)" }}/>
                {tp.tag && (
                  <span style={{ position: "absolute", top: 12, left: 12, padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}>{tp.tag}</span>
                )}
                <div style={{ position: "absolute", right: 12, bottom: 12, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", paddingLeft: 2, color: "white" }}>
                  <IconPlay size={11}/>
                </div>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.015em" }}>{tp.t}</div>
                <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 4 }}>{tp.d.toUpperCase()}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppChrome>
  );
};

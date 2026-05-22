import { useRef, useState } from "react";
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
  useIsMobile,
  type NavKey,
} from "../primitives";

type Template = { t: string; d: string; c: string; tag?: string; time: string };
type Community = { by: string; team: string; title: string; c: string; views: string };

export const HomeScreen = ({
  onNav,
  onPickTemplate,
  onNewBlank,
  onSeePricing,
  credits,
}: {
  onNav?: (k: NavKey) => void;
  onPickTemplate?: () => void;
  onNewBlank?: () => void;
  // Top-bar pill is rendered by AppChrome; footer CTA also routes here.
  onSeePricing?: () => void;
  // Live credit balance from user_billing — passed straight to AppChrome.
  credits?: number | null;
}) => {
  const f = useFrame();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const m = useIsMobile(rootRef, 720);
  const cats = ["All", "Product launch", "Feature reveal", "Funding", "Recap", "Social reel"];
  const [cat, setCat] = useState("All");

  const templates: Template[] = [
    { t: "Linear-style hero",     d: "Crisp · 45s",  c: "linear-gradient(135deg, #5468FF, #2D3340)", tag: "Most popular", time: "2 min" },
    { t: "Apple cinematic",       d: "Soft · 60s",   c: "linear-gradient(135deg, #1F2937, #000)", time: "3 min" },
    { t: "Hype announcement",     d: "Bold · 30s",   c: "linear-gradient(135deg, #F472B6, #7AA2FF)", tag: "Trending", time: "90s" },
    { t: "Vertical reel",         d: "9:16 · 15s",   c: "linear-gradient(135deg, #67E8F9, #7AA2FF)", time: "60s" },
    { t: "Funding announcement",  d: "Soft · 50s",   c: "linear-gradient(135deg, #A78BFA, #67E8F9)", time: "3 min" },
    { t: "Quarterly recap",       d: "Linear · 90s", c: "linear-gradient(135deg, #1F2937, #5468FF)", time: "4 min" },
    { t: "Feature deep-dive",     d: "Apple · 75s",  c: "linear-gradient(135deg, #2D3340, #7AA2FF)", time: "3 min" },
    { t: "Customer story",        d: "Soft · 60s",   c: "linear-gradient(135deg, #7AA2FF, #F472B6)", time: "2 min" },
  ];

  const community: Community[] = [
    { by: "@aria",   team: "Notion", title: "Q4 launch teaser",   c: "linear-gradient(135deg, #1F2937, #5468FF)", views: "12.4k" },
    { by: "@daniel", team: "Vercel", title: "Edge runtime intro", c: "linear-gradient(135deg, #A78BFA, #5468FF)", views: "8.1k" },
    { by: "@maya",   team: "Linear", title: "Cycle 21 recap",     c: "linear-gradient(135deg, #67E8F9, #7AA2FF)", views: "6.7k" },
  ];

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
    <AppChrome
      active="home"
      onNav={onNav}
      project="Home"
      credits={credits}
      mobile={m}
      right={
        m ? null : (
          <Button variant="ghost" size="sm" icon={<IconUpload size={12} />} onClick={onNewBlank ?? onPickTemplate}>
            Import screenshots
          </Button>
        )
      }
    >
      <div className="mf-bg-bloom" />

      <div style={{ position: "relative", padding: m ? "24px 18px 32px" : "40px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        {/* Hero invite */}
        <div style={{ marginBottom: m ? 22 : 32 }}>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: m ? 28 : 48, lineHeight: 1.05 }}>
            Make your first video in <span className="mf-grad-text">60 seconds.</span>
          </h1>
          <div className="mf-body" style={{ marginTop: m ? 10 : 12, fontSize: m ? 14 : 16, color: "var(--ink-2)", maxWidth: 640 }}>
            Pick a template, drop a screenshot, or remix something we made — your credits cover the render.
          </div>
        </div>

        {/* Two-path start */}
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: m ? 10 : 14, marginBottom: m ? 32 : 44 }}>
          <PathCard
            variant="primary"
            eyebrow="FASTEST · 0 SETUP"
            title="Try the demo with sample assets"
            body="Pre-loaded with screenshots, script, and music. Hit play and watch a real launch video render."
            cta="Open the demo"
            icon={<IconPlay size={13} />}
            onClick={onPickTemplate}
          />
          <PathCard
            variant="dashed"
            eyebrow="BRING YOUR OWN"
            title="Drop in your screenshots"
            body="Paste your launch script and we'll turn your assets into a cinematic video — yours to keep."
            cta="Start blank"
            icon={<IconUpload size={13} />}
            onClick={onNewBlank ?? onPickTemplate}
          />
        </div>

        {/* Featured */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div>
            <div className="mf-eyebrow">FEATURED</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em" }}>
              See it move — then remix it.
            </h2>
          </div>
          <button
            style={{
              background: "transparent", border: "none", color: "var(--ink-2)",
              fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            All featured <IconArrowRight size={11} />
          </button>
        </div>

        <div onClick={onPickTemplate} style={{ position: "relative", marginBottom: 48, cursor: "pointer" }}>
          <CinemaPreview aspect="2.4 / 1" frame={f} label="FEATURED · LINEAR-STYLE LAUNCH · LIVE PREVIEW">
            <div
              style={{
                position: "absolute", left: 36, bottom: 36, right: 36,
                display: "flex", justifyContent: "space-between", alignItems: "flex-end",
              }}
            >
              <div>
                <Pill tone="glow" icon={<IconSparkle size={11} />}>
                  <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>WATCH · 45 SECONDS</span>
                </Pill>
                <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 14, color: "white" }}>
                  The launch film, in 45 seconds.
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
                  6 scenes · Linear preset · 4K · use it as a starting point
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="ghost" size="md" icon={<IconPlay size={13} />}>Play</Button>
                <Button variant="primary" size="md" iconRight={<IconArrowRight size={14} />}>Remix this</Button>
              </div>
            </div>
          </CinemaPreview>
        </div>

        {/* Templates header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div className="mf-eyebrow">TEMPLATES</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em" }}>
              Hand-tuned by motion designers.
            </h2>
          </div>
          <span className="mf-mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
            EVERY TEMPLATE WORKS WITH YOUR SAMPLE ASSETS
          </span>
        </div>

        {/* Categories */}
        <div style={{ display: "flex", gap: 6, marginBottom: 22, marginTop: 18, flexWrap: "wrap" }}>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                background: cat === c ? "rgba(255,255,255,0.08)" : "transparent",
                border: `1px solid ${cat === c ? "var(--line-2)" : "var(--line)"}`,
                color: cat === c ? "var(--ink-0)" : "var(--ink-2)",
                transition: "all 160ms",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: m ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
            gap: m ? 12 : 16, marginBottom: m ? 36 : 56,
          }}
        >
          {templates.map((tp, i) => (
            <TemplateCard key={i} tp={tp} onClick={onPickTemplate} />
          ))}
        </div>

        {/* Made with motion */}
        <div style={{ marginBottom: 18 }}>
          <div className="mf-eyebrow">MADE WITH MOTION</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em" }}>
              Real launches, this week.
            </h2>
            <span className="mf-mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.10em" }}>
              4,820 VIDEOS RENDERED · LAST 7 DAYS
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3, 1fr)", gap: m ? 12 : 14 }}>
          {community.map((c, i) => (
            <CommunityCard key={i} c={c} onClick={onPickTemplate} />
          ))}
        </div>

        {/* Soft footer prompt */}
        <div
          style={{
            marginTop: m ? 36 : 56, padding: m ? "20px 20px" : "26px 28px", borderRadius: 16,
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
            display: "flex",
            flexDirection: m ? "column" : "row",
            alignItems: m ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: m ? 14 : 24,
          }}
        >
          <div>
            <div style={{ fontSize: m ? 15 : 16, fontWeight: 500, color: "white", letterSpacing: "-0.01em" }}>
              Need more credits?
            </div>
            <div style={{ marginTop: 4, fontSize: m ? 12.5 : 13, color: "var(--ink-2)" }}>
              Top up with a credit pack or upgrade your plan anytime.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, width: m ? "100%" : "auto" }}>
            <Button variant="primary" size="md" iconRight={<IconArrowRight size={14} />} onClick={onSeePricing}>See pricing</Button>
          </div>
        </div>
      </div>
    </AppChrome>
    </div>
  );
};

const PathCard = ({
  variant,
  eyebrow,
  title,
  body,
  cta,
  icon,
  onClick,
}: {
  variant: "primary" | "dashed";
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) => {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", padding: "22px 24px",
        borderRadius: 16, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        background: primary
          ? "linear-gradient(135deg, rgba(122,162,255,0.10), rgba(167,139,250,0.04))"
          : "rgba(255,255,255,0.025)",
        border: primary ? "1px solid rgba(122,162,255,0.30)" : "1px dashed var(--line-2)",
        overflow: "hidden",
        transition: "all 240ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow =
            "0 16px 40px -16px rgba(122,162,255,0.35), 0 0 0 1px rgba(122,162,255,0.40)";
        } else {
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)";
          e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        if (primary) {
          e.currentTarget.style.boxShadow = "";
        } else {
          e.currentTarget.style.borderColor = "var(--line-2)";
          e.currentTarget.style.background = "rgba(255,255,255,0.025)";
        }
      }}
    >
      {primary && (
        <div
          style={{
            position: "absolute", right: -30, top: -30, width: 180, height: 180,
            borderRadius: "50%", pointerEvents: "none",
            background: "radial-gradient(circle, rgba(122,162,255,0.22), transparent 65%)",
            filter: "blur(20px)",
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, position: "relative" }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 9,
            background: primary ? "rgba(122,162,255,0.18)" : "rgba(255,255,255,0.05)",
            border: primary ? "1px solid rgba(122,162,255,0.40)" : "1px solid var(--line-2)",
            display: "grid", placeItems: "center",
            color: primary ? "#7AA2FF" : "var(--ink-1)",
          }}
        >
          {icon}
        </div>
        <span
          className="mf-mono"
          style={{
            fontSize: 10, letterSpacing: "0.14em",
            color: primary ? "#7AA2FF" : "var(--ink-3)",
          }}
        >
          {eyebrow}
        </span>
      </div>
      <div
        style={{
          fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em",
          color: "white", marginBottom: 6, position: "relative",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5,
          marginBottom: 16, position: "relative",
        }}
      >
        {body}
      </div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: primary ? "#DCE4FF" : "var(--ink-1)",
          fontWeight: 500, position: "relative",
        }}
      >
        <span>{cta}</span>
        <IconArrowRight size={13} />
      </div>
    </button>
  );
};

const TemplateCard = ({ tp, onClick }: { tp: Template; onClick?: () => void }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 0, borderRadius: 14, overflow: "hidden",
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${hover ? "var(--line-2)" : "var(--line)"}`,
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
        transform: hover ? "translateY(-3px)" : "",
        boxShadow: hover
          ? "0 20px 40px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.10)"
          : "",
      }}
    >
      <div style={{ aspectRatio: "16/10", background: tp.c, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 55%)",
          }}
        />

        {tp.tag && (
          <span
            style={{
              position: "absolute", top: 12, left: 12, padding: "4px 8px", borderRadius: 5,
              fontSize: 10, fontWeight: 500, letterSpacing: "0.02em",
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)",
              color: "white", border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {tp.tag}
          </span>
        )}

        <span
          className="mf-mono"
          style={{
            position: "absolute", top: 12, right: 12, padding: "3px 7px", borderRadius: 5,
            fontSize: 9.5, fontWeight: 500, letterSpacing: "0.08em",
            background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)",
            color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          ~{tp.time.toUpperCase()}
        </span>

        <div
          style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, transparent 40%, rgba(6,7,10,0.75) 100%)",
            opacity: hover ? 1 : 0,
            transition: "opacity 240ms",
            display: "flex", alignItems: "flex-end", padding: 14,
          }}
        >
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 7,
              background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
              color: "#0B0C10", fontSize: 12, fontWeight: 600,
              boxShadow: "0 6px 16px -4px rgba(122,162,255,0.55)",
            }}
          >
            <IconPlay size={10} />
            Try with sample
          </span>
        </div>

        <div
          style={{
            position: "absolute", right: 12, bottom: 12,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(10px)", display: "grid", placeItems: "center",
            paddingLeft: 2, color: "white",
            opacity: hover ? 0 : 1, transition: "opacity 200ms",
          }}
        >
          <IconPlay size={11} />
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.015em" }}>{tp.t}</div>
        <div
          className="mf-mono"
          style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 4 }}
        >
          {tp.d.toUpperCase()}
        </div>
      </div>
    </button>
  );
};

const CommunityCard = ({ c, onClick }: { c: Community; onClick?: () => void }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 0, borderRadius: 14, overflow: "hidden",
        background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
        transform: hover ? "translateY(-3px)" : "",
        boxShadow: hover ? "0 20px 40px -16px rgba(0,0,0,0.6)" : "",
      }}
    >
      <div style={{ aspectRatio: "16/10", background: c.c, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
          }}
        />
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 5,
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: 10, color: "rgba(255,255,255,0.85)",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#A6F0BD" }} />
            <span className="mf-mono" style={{ letterSpacing: "0.08em" }}>{c.views}</span>
          </span>
        </div>
        <div
          style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            opacity: hover ? 1 : 0.85, transition: "opacity 200ms",
          }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)",
              backdropFilter: "blur(10px)",
              display: "grid", placeItems: "center", paddingLeft: 3, color: "white",
              transform: hover ? "scale(1.06)" : "scale(1)",
              transition: "transform 240ms",
            }}
          >
            <IconPlay size={17} />
          </div>
        </div>
      </div>
      <div
        style={{
          padding: "14px 16px", display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.015em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {c.title}
          </div>
          <div
            className="mf-mono"
            style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 4 }}
          >
            BY {c.by.toUpperCase()} · {c.team.toUpperCase()}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0, fontSize: 11.5,
            color: hover ? "#7AA2FF" : "var(--ink-3)",
            display: "inline-flex", alignItems: "center", gap: 3,
            transition: "color 200ms",
          }}
        >
          Remix <IconArrowRight size={11} />
        </span>
      </div>
    </button>
  );
};

/* Premium paywall modal — triggered at the moment of value creation */

const PaywallModal = ({ open, onClose, onSignIn, onUpgrade, trigger = "generate" }) => {
  const [plan, setPlan] = useState("annual");

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = {
    generate: {
      eyebrow: "ONE STEP AWAY FROM CINEMA",
      title: "Render your first video",
      sub: "You've built the story — now bring it to life. Pro unlocks unlimited 4K renders, premium motion, and commercial rights.",
    },
    export: {
      eyebrow: "READY TO SHIP",
      title: "Export in 4K",
      sub: "Download your video without watermark — and a dozen more, on us.",
    },
    save: {
      eyebrow: "SAVE THIS WORK",
      title: "Keep your projects",
      sub: "Save unlimited projects, share preview links, and pick up where you left off — on any device.",
    },
  }[trigger] || {};

  const features = [
    { icon: <IconWand size={13}/>,     t: "Unlimited AI generations",   d: "Render as many videos as you want, every month" },
    { icon: <IconSparkle size={13}/>,  t: "Premium cinematic engine",   d: "Motion v2 · depth parallax · color grading" },
    { icon: <IconDownload size={13}/>, t: "4K export · no watermark",   d: "Studio-grade output ready for any platform" },
    { icon: <IconLayers size={13}/>,   t: "Saved projects · version history", d: "Pick up exactly where you left off" },
    { icon: <IconShare size={13}/>,    t: "Share & collaborate",        d: "Preview links, team comments, role permissions" },
    { icon: <IconCheck size={13}/>,    t: "Commercial usage rights",    d: "Use everywhere — ads, launches, paid campaigns" },
  ];

  const plans = {
    monthly: { price: 24, sub: "per month", note: "Billed monthly · cancel anytime" },
    annual:  { price: 19, sub: "per month", note: "Billed annually · 2 months free", badge: "SAVE 20%" },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        display: "grid", placeItems: "center",
        background: "rgba(6,7,10,0.78)",
        backdropFilter: "blur(14px) saturate(120%)",
        WebkitBackdropFilter: "blur(14px) saturate(120%)",
        padding: 24,
        animation: "mfFadeIn 240ms ease",
        fontFamily: "'Geist', system-ui, sans-serif",
      }}>
      <style>{`
        @keyframes mfFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes mfRiseIn { from { opacity: 0; transform: translateY(12px) scale(0.985) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes mfShimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(960px, 100%)",
          maxHeight: "min(720px, 100%)",
          background: "linear-gradient(180deg, #0E1018 0%, #08090E 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          boxShadow: "0 40px 120px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(122,162,255,0.10), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow: "hidden",
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          animation: "mfRiseIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}>

        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: -120, left: -80, width: 460, height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(122,162,255,0.22), transparent 60%)",
          filter: "blur(40px)", pointerEvents: "none", zIndex: 0
        }}/>
        <div style={{
          position: "absolute", bottom: -120, right: -80, width: 460, height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.18), transparent 60%)",
          filter: "blur(40px)", pointerEvents: "none", zIndex: 0
        }}/>

        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14, zIndex: 4,
          width: 28, height: 28, borderRadius: 8,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.6)", cursor: "pointer",
          display: "grid", placeItems: "center", fontFamily: "inherit"
        }}>
          <IconClose size={13}/>
        </button>

        {/* ─── LEFT: pitch + features ─── */}
        <div style={{
          padding: "40px 38px 36px",
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column", gap: 22,
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* Eyebrow */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF",
              boxShadow: "0 0 10px rgba(122,162,255,0.9)"
            }}/>
            <span className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "#7AA2FF" }}>
              {copy.eyebrow}
            </span>
          </div>

          <div>
            <h2 style={{
              margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em",
              lineHeight: 1.08, color: "white"
            }}>
              {copy.title.split(" ").slice(0, -1).join(" ")}{" "}
              <span style={{
                background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>
                {copy.title.split(" ").slice(-1)[0]}
              </span>
            </h2>
            <p style={{
              margin: "12px 0 0", fontSize: 14.5, color: "rgba(255,255,255,0.66)",
              lineHeight: 1.55, maxWidth: 380
            }}>
              {copy.sub}
            </p>
          </div>

          {/* Feature grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
            marginTop: 4
          }}>
            {features.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: "rgba(122,162,255,0.10)",
                  border: "1px solid rgba(122,162,255,0.25)",
                  display: "grid", placeItems: "center", color: "#7AA2FF"
                }}>{it.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: "white", lineHeight: 1.3 }}>{it.t}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, lineHeight: 1.4 }}>{it.d}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Trust strip */}
          <div style={{
            marginTop: "auto", paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", gap: 14, color: "rgba(255,255,255,0.5)", fontSize: 11.5
          }}>
            <div style={{ display: "flex" }}>
              {Array.from({length: 4}).map((_, i) => (
                <div key={i} style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i*30}), oklch(0.55 0.18 ${280 + i*20}))`,
                  border: "2px solid #0E1018", marginLeft: i===0 ? 0 : -7
                }}/>
              ))}
            </div>
            <span>Loved by 12,400+ founders & product teams</span>
          </div>
        </div>

        {/* ─── RIGHT: plan + CTA ─── */}
        <div style={{
          padding: "40px 36px 36px",
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, rgba(122,162,255,0.025), rgba(0,0,0,0))"
        }}>
          {/* Billing toggle */}
          <div style={{
            display: "inline-flex", padding: 3, borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            alignSelf: "flex-start", marginBottom: 22
          }}>
            {["monthly", "annual"].map(k => (
              <button key={k} onClick={() => setPlan(k)} style={{
                padding: "6px 14px", borderRadius: 7, border: "none",
                background: plan === k ? "rgba(255,255,255,0.08)" : "transparent",
                color: plan === k ? "white" : "rgba(255,255,255,0.55)",
                fontFamily: "inherit", fontSize: 12, fontWeight: 500,
                cursor: "pointer", textTransform: "capitalize",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 200ms"
              }}>
                {k}
                {k === "annual" && (
                  <span className="mf-mono" style={{
                    fontSize: 9, letterSpacing: "0.06em",
                    padding: "1.5px 5px", borderRadius: 3,
                    background: "rgba(166,240,189,0.14)", color: "#A6F0BD",
                    border: "1px solid rgba(166,240,189,0.30)"
                  }}>−20%</span>
                )}
              </button>
            ))}
          </div>

          {/* Plan card */}
          <div style={{
            padding: "22px 22px 20px", borderRadius: 14,
            background: "linear-gradient(180deg, rgba(122,162,255,0.06), rgba(167,139,250,0.03))",
            border: "1px solid rgba(122,162,255,0.25)",
            boxShadow: "0 12px 40px -12px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
            position: "relative", overflow: "hidden",
            marginBottom: 16
          }}>
            {/* Shimmer */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "mfShimmer 4.5s linear infinite",
              opacity: 0.7
            }}/>

            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "white" }}>Motion Pro</span>
                <span className="mf-mono" style={{
                  fontSize: 9, letterSpacing: "0.08em",
                  padding: "2px 6px", borderRadius: 4,
                  background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
                  color: "#0B0C10", fontWeight: 600
                }}>MOST POPULAR</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, position: "relative" }}>
              <span style={{
                fontSize: 56, fontWeight: 500, letterSpacing: "-0.04em",
                color: "white", lineHeight: 1
              }}>${plans[plan].price}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{plans[plan].sub}</span>
            </div>
            <div className="mf-mono" style={{
              marginTop: 8, fontSize: 10.5, letterSpacing: "0.06em",
              color: "rgba(255,255,255,0.45)", position: "relative"
            }}>{plans[plan].note}</div>
          </div>

          {/* Primary CTA */}
          <button onClick={onUpgrade} style={{
            width: "100%", height: 48, borderRadius: 12, marginBottom: 10,
            border: "1px solid rgba(167,139,250,0.50)",
            background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
            backgroundSize: "200% 100%",
            color: "#0B0C10", fontSize: 14, fontWeight: 600,
            fontFamily: "inherit", letterSpacing: "-0.005em",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 12px 32px -8px rgba(122,162,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            transition: "transform 160ms, box-shadow 160ms, background-position 600ms"
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.backgroundPosition = "100% 0"; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.backgroundPosition = "0% 0"; }}>
            <IconSparkle size={14}/>
            Upgrade to Pro
            <IconArrowRight size={14}/>
          </button>

          {/* Try free CTA */}
          <button onClick={onClose} style={{
            width: "100%", height: 40, borderRadius: 10, marginBottom: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "white", fontSize: 12.5, fontWeight: 500,
            fontFamily: "inherit", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "background 160ms"
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}>
            <IconWand size={12}/>
            Use a free credit
            <span className="mf-mono" style={{
              fontSize: 9.5, letterSpacing: "0.06em",
              padding: "2px 5px", borderRadius: 4,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)"
            }}>2 LEFT</span>
          </button>

          {/* Sign in */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 12.5, color: "rgba(255,255,255,0.55)"
          }}>
            <span>Already have an account?</span>
            <button onClick={onSignIn} style={{
              background: "transparent", border: "none",
              color: "#7AA2FF", fontSize: 12.5, fontWeight: 500,
              fontFamily: "inherit", cursor: "pointer", padding: 0
            }}>Sign in →</button>
          </div>

          {/* Guarantees */}
          <div style={{
            marginTop: "auto", paddingTop: 18,
            display: "flex", flexDirection: "column", gap: 7,
            fontSize: 11.5, color: "rgba(255,255,255,0.45)"
          }}>
            {[
              "Cancel anytime, no questions asked",
              "30-day money-back guarantee",
              "Secure payment · Stripe",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <IconCheck size={11} style={{ color: "rgba(166,240,189,0.7)" }}/>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.PaywallModal = PaywallModal;

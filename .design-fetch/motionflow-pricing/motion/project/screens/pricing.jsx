/* Pricing — 4 plan tiers, each with an in-card credit slider.
   Picking a slider value live-recalculates that card's monthly price.
   Selecting a card sets the active plan (highlighted ring + CTA). */

const PRICING_PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For curious creators kicking the tires.",
    accent: "#9CA3AF",
    gradient: "linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)",
    pricePerCredit: 0.18,
    baseFee: 0,
    credits: { min: 50, max: 400, step: 50, default: 100 },
    perks: [
      "720p export",
      "Watermark on shared videos",
      "5 templates",
      "Community support",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "For solo founders shipping launch videos weekly.",
    accent: "#7AA2FF",
    gradient: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 100%)",
    pricePerCredit: 0.12,
    baseFee: 12,
    credits: { min: 200, max: 1500, step: 50, default: 600 },
    perks: [
      "1080p export · no watermark",
      "30+ premium templates",
      "Voiceover & stock library",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growth teams running multiple launches.",
    accent: "#A78BFA",
    gradient: "linear-gradient(135deg, #A78BFA 0%, #67E8F9 100%)",
    pricePerCredit: 0.09,
    baseFee: 39,
    credits: { min: 500, max: 5000, step: 100, default: 2000 },
    popular: true,
    perks: [
      "4K export · 60fps",
      "Director Studio · AI pipeline",
      "Brand kit · custom fonts",
      "Priority queue · 3× faster renders",
      "Live-chat support",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "For agencies and in-house content studios.",
    accent: "#67E8F9",
    gradient: "linear-gradient(135deg, #67E8F9 0%, #A6F0BD 100%)",
    pricePerCredit: 0.07,
    baseFee: 149,
    credits: { min: 2000, max: 20000, step: 500, default: 6000 },
    perks: [
      "Unlimited seats · SSO",
      "API access · custom models",
      "Dedicated render cluster",
      "Shared brand library",
      "Named CSM · onboarding",
    ],
  },
];

const PricingScreen = ({ onBack, onChoose }) => {
  const [billing, setBilling] = useState("monthly"); // "monthly" | "annual"
  const [selectedId, setSelectedId] = useState("pro");

  // Per-card credit selection (independent slider per plan)
  const initialCredits = useMemo(
    () => Object.fromEntries(PRICING_PLANS.map(p => [p.id, p.credits.default])),
    []
  );
  const [credits, setCredits] = useState(initialCredits);

  const setCardCredits = (id, val) =>
    setCredits(c => ({ ...c, [id]: val }));

  const annualMultiplier = billing === "annual" ? 0.80 : 1.0; // 20% off annually

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "auto",
      background: "var(--bg-0)", color: "var(--ink-0)",
      fontFamily: "'Geist', system-ui, sans-serif", position: "relative"
    }}>
      {/* Ambient bloom */}
      <div style={{
        position: "absolute", top: -300, left: "8%", width: 800, height: 800,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(circle, rgba(122,162,255,0.13), transparent 60%)",
        filter: "blur(60px)"
      }}/>
      <div style={{
        position: "absolute", top: 200, right: "5%", width: 700, height: 700,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(circle, rgba(167,139,250,0.10), transparent 60%)",
        filter: "blur(60px)"
      }}/>
      <div style={{
        position: "absolute", bottom: -200, left: "30%", width: 700, height: 700,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(circle, rgba(103,232,249,0.08), transparent 60%)",
        filter: "blur(60px)"
      }}/>

      {/* ─── Header ─── */}
      <header style={{
        position: "relative", zIndex: 2,
        padding: "22px 56px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--line)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconLogo size={24}/>
          <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em" }}>Videly</span>
          <span className="mf-nav-badge">AI</span>
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          <a style={{ color: "var(--ink-2)", fontSize: 14, cursor: "pointer" }}>Product</a>
          <a style={{ color: "var(--ink-2)", fontSize: 14, cursor: "pointer" }}>Showcase</a>
          <a style={{ color: "white", fontSize: 14, cursor: "pointer", fontWeight: 500 }}>Pricing</a>
          <a style={{ color: "var(--ink-2)", fontSize: 14, cursor: "pointer" }}>Docs</a>
        </div>
        <button onClick={onBack} style={{
          background: "transparent", border: "none", color: "var(--ink-2)",
          fontFamily: "inherit", fontSize: 13, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6
        }}>
          <IconClose size={12}/> Close
        </button>
      </header>

      {/* ─── Title block ─── */}
      <section style={{
        position: "relative", zIndex: 2,
        maxWidth: 1320, margin: "0 auto", padding: "64px 56px 24px",
        textAlign: "center"
      }}>
        <div className="mf-eyebrow" style={{ marginBottom: 18 }}>PRICING · PAY FOR WHAT YOU RENDER</div>
        <h1 style={{
          margin: 0, fontSize: 60, fontWeight: 500,
          letterSpacing: "-0.035em", lineHeight: 1.02
        }}>
          Plans that scale with your{" "}
          <span style={{
            background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
          }}>render volume</span>
        </h1>
        <p style={{
          margin: "16px auto 0", maxWidth: 580, fontSize: 16,
          color: "var(--ink-2)", lineHeight: 1.55, letterSpacing: "-0.005em"
        }}>
          Drag the slider on any plan to dial in the credits you actually need.
          One credit ≈ one second of generated motion. Unused credits roll over.
        </p>

        {/* Billing toggle */}
        <div style={{ marginTop: 32, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "inline-flex", padding: 4,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--line)",
            borderRadius: 999
          }}>
            {[
              { k: "monthly", l: "Monthly" },
              { k: "annual",  l: "Annual" },
            ].map(opt => {
              const active = billing === opt.k;
              return (
                <button key={opt.k} onClick={()=>setBilling(opt.k)} style={{
                  padding: "9px 20px", borderRadius: 999, border: "none",
                  background: active ? "linear-gradient(135deg, #7AA2FF, #A78BFA)" : "transparent",
                  color: active ? "#0B0C10" : "var(--ink-2)",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                  cursor: "pointer", letterSpacing: "-0.005em",
                  boxShadow: active ? "0 6px 18px -6px rgba(122,162,255,0.5)" : "none",
                  transition: "all 200ms"
                }}>
                  {opt.l}
                  {opt.k === "annual" && (
                    <span className="mf-mono" style={{
                      marginLeft: 8, fontSize: 9.5, letterSpacing: "0.08em",
                      padding: "2px 5px", borderRadius: 3,
                      background: active ? "rgba(11,12,16,0.18)" : "rgba(166,240,189,0.14)",
                      color: active ? "#0B0C10" : "#A6F0BD",
                      fontWeight: 600
                    }}>−20%</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 4 plan cards ─── */}
      <section style={{
        position: "relative", zIndex: 2,
        maxWidth: 1440, margin: "0 auto", padding: "40px 40px 24px",
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18,
        alignItems: "stretch"
      }}>
        {PRICING_PLANS.map(plan => (
          <PricingCard
            key={plan.id}
            plan={plan}
            credits={credits[plan.id]}
            onCredits={(v)=>setCardCredits(plan.id, v)}
            selected={selectedId === plan.id}
            onSelect={()=>setSelectedId(plan.id)}
            annualMultiplier={annualMultiplier}
            billing={billing}
            onChoose={()=>onChoose && onChoose({ plan: plan.id, credits: credits[plan.id], billing })}
          />
        ))}
      </section>

      {/* ─── Comparison strip ─── */}
      <section style={{
        position: "relative", zIndex: 2,
        maxWidth: 1320, margin: "40px auto 0", padding: "0 56px"
      }}>
        <div style={{
          padding: "20px 26px", borderRadius: 16,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid var(--line)",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 24
        }}>
          {[
            { l: "Cancel anytime",     s: "Stop renewing, keep credits until they expire." },
            { l: "Rollover credits",   s: "Unused credits carry to the next cycle." },
            { l: "Top-up anytime",     s: "Buy extra credits without changing plan." },
            { l: "Team-ready",         s: "Invite collaborators on Pro and Studio." },
          ].map((c, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                  background: "rgba(166,240,189,0.10)", border: "1px solid rgba(166,240,189,0.30)",
                  color: "#A6F0BD", display: "grid", placeItems: "center"
                }}><IconCheck size={11}/></span>
                <span style={{ fontSize: 13, color: "white", fontWeight: 500 }}>{c.l}</span>
              </div>
              <p style={{ margin: "0 0 0 26px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>{c.s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section style={{
        position: "relative", zIndex: 2,
        maxWidth: 1100, margin: "64px auto 0", padding: "0 56px 80px"
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 10 }}>FAQ · CREDITS DEMYSTIFIED</div>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 500, letterSpacing: "-0.025em" }}>
            Questions about credits & pricing
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { q: "What is a credit?",            a: "One credit renders ~1 second of motion at 1080p. 4K renders cost 2 credits/sec; voiceover is 0.2 credits/sec." },
            { q: "Do credits expire?",           a: "Monthly credits roll over once. Annual credits roll over for the full billing year." },
            { q: "Can I change plans later?",    a: "Yes — upgrade instantly, downgrade at the end of your cycle. We pro-rate the difference." },
            { q: "Need more than 20,000?",       a: "Reach out for a Studio+ contract. We can dedicate render capacity and tune the model to your brand." },
          ].map((it, i) => (
            <div key={i} style={{
              padding: "18px 20px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)"
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "white", letterSpacing: "-0.01em" }}>
                {it.q}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {it.a}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ────────────────── Card ────────────────── */
const PricingCard = ({ plan, credits, onCredits, selected, onSelect, annualMultiplier, billing, onChoose }) => {
  const { min, max, step } = plan.credits;
  const pct = (credits - min) / (max - min);

  // monthly price = baseFee + credits * pricePerCredit (then discounted if annual)
  const rawMonthly = plan.baseFee + credits * plan.pricePerCredit;
  const monthly = rawMonthly * annualMultiplier;
  const dollars = Math.floor(monthly);
  const cents = Math.round((monthly - dollars) * 100).toString().padStart(2, "0");
  const annualTotal = Math.round(monthly * 12);

  const popular = !!plan.popular;

  return (
    <div
      onClick={onSelect}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column",
        padding: "28px 24px 26px",
        borderRadius: 18,
        background: selected
          ? "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${selected ? "rgba(255,255,255,0.18)" : "var(--line)"}`,
        boxShadow: selected
          ? `0 24px 60px -20px ${plan.accent}55, 0 0 0 1px ${plan.accent}40, inset 0 1px 0 rgba(255,255,255,0.04)`
          : "0 6px 22px -10px rgba(0,0,0,0.6)",
        cursor: "pointer",
        transition: "all 280ms cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
        minHeight: 620,
      }}>
      {/* Popular ribbon */}
      {popular && (
        <div style={{
          position: "absolute", top: 14, right: 14, zIndex: 2,
          padding: "4px 9px", borderRadius: 999,
          background: plan.gradient,
          fontSize: 9.5, fontFamily: "Geist Mono, monospace",
          letterSpacing: "0.10em", fontWeight: 600, color: "#0B0C10"
        }}>
          MOST POPULAR
        </div>
      )}

      {/* Glow swatch */}
      <div style={{
        position: "absolute", top: -40, left: -40, width: 200, height: 200,
        borderRadius: "50%", pointerEvents: "none",
        background: plan.gradient, opacity: selected ? 0.18 : 0.08,
        filter: "blur(40px)", transition: "opacity 280ms"
      }}/>

      {/* Plan header */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 3,
            background: plan.gradient, boxShadow: `0 0 16px ${plan.accent}80`
          }}/>
          <span style={{
            fontSize: 15, fontWeight: 500, color: "white",
            letterSpacing: "-0.01em"
          }}>{plan.name}</span>
        </div>
        <p style={{
          margin: 0, fontSize: 12.5, color: "var(--ink-3)",
          lineHeight: 1.5, minHeight: 36
        }}>{plan.tagline}</p>
      </div>

      {/* Price */}
      <div style={{ position: "relative", zIndex: 1, marginTop: 22, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 400 }}>$</span>
          <span style={{
            fontSize: 48, fontWeight: 500, color: "white",
            letterSpacing: "-0.035em", lineHeight: 1
          }}>{dollars}</span>
          <span style={{ fontSize: 18, color: "var(--ink-3)", fontWeight: 400, marginLeft: -2 }}>.{cents}</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 6 }}>/ month</span>
        </div>
        <div className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", color: "var(--ink-4)", marginTop: 6 }}>
          {billing === "annual" ? `BILLED $${annualTotal}/YR · SAVES 20%` : "BILLED MONTHLY"}
        </div>
      </div>

      {/* Credit slider */}
      <div style={{ position: "relative", zIndex: 1, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "var(--ink-3)" }}>
            CREDITS / MONTH
          </span>
          <span style={{
            fontFamily: "Geist Mono, monospace",
            fontSize: 14, fontWeight: 500, color: "white",
            letterSpacing: "-0.005em"
          }}>
            {credits.toLocaleString()}
          </span>
        </div>

        <CreditSlider
          value={credits}
          onChange={onCredits}
          min={min} max={max} step={step}
          accent={plan.accent}
          gradient={plan.gradient}
          onCardClick={onSelect}
        />

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-4)" }}>
            {min.toLocaleString()}
          </span>
          <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-4)" }}>
            {max.toLocaleString()}
          </span>
        </div>

        <div style={{
          marginTop: 12,
          padding: "8px 11px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid var(--line)",
          fontSize: 11, color: "var(--ink-2)",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span>≈ {Math.round(credits/60).toLocaleString()} min of motion</span>
          <span className="mf-mono" style={{ color: "var(--ink-3)", fontSize: 10.5 }}>
            ${(plan.pricePerCredit * annualMultiplier).toFixed(2)}/cr
          </span>
        </div>
      </div>

      {/* Perks */}
      <ul style={{
        position: "relative", zIndex: 1,
        margin: "22px 0 0", padding: 0, listStyle: "none",
        display: "flex", flexDirection: "column", gap: 9, flex: 1
      }}>
        {plan.perks.map((perk, i) => (
          <li key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 9,
            fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.45
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              marginTop: 1,
              background: `${plan.accent}1F`,
              border: `1px solid ${plan.accent}55`,
              color: plan.accent,
              display: "grid", placeItems: "center"
            }}><IconCheck size={10}/></span>
            {perk}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={(e)=>{ e.stopPropagation(); onChoose && onChoose(); }}
        style={{
          marginTop: 22,
          width: "100%", padding: "13px 16px", borderRadius: 10,
          border: selected ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--line-2)",
          background: selected ? plan.gradient : "rgba(255,255,255,0.04)",
          color: selected ? "#0B0C10" : "white",
          fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
          letterSpacing: "-0.005em", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          boxShadow: selected ? `0 12px 30px -10px ${plan.accent}80` : "none",
          transition: "all 220ms"
        }}>
        {selected ? `Choose ${plan.name}` : `Pick ${plan.name}`}
        <IconArrowRight size={13}/>
      </button>
    </div>
  );
};

/* ────────────────── Slider ────────────────── */
const CreditSlider = ({ value, min, max, step, onChange, accent, gradient, onCardClick }) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;

  const setFromClientX = (clientX) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Math.min(max, Math.max(min, snapped)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => setFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  // Tick marks at 0/25/50/75/100%
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        e.stopPropagation();
        onCardClick && onCardClick();
        setDragging(true);
        setFromClientX(e.clientX);
      }}
      style={{
        position: "relative",
        height: 28,
        cursor: "pointer",
        touchAction: "none",
        userSelect: "none",
        display: "flex", alignItems: "center"
      }}>
      {/* Track */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 6,
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--line)"
      }}/>
      {/* Filled */}
      <div style={{
        position: "absolute", left: 0, height: 6,
        width: `${pct}%`,
        borderRadius: 999,
        background: gradient,
        boxShadow: `0 0 18px ${accent}80`
      }}/>
      {/* Ticks */}
      {ticks.map(t => (
        <span key={t} style={{
          position: "absolute", left: `${t}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 2, height: 6, borderRadius: 1,
          background: t * 100 / 100 <= pct ? "rgba(11,12,16,0.4)" : "rgba(255,255,255,0.10)",
          pointerEvents: "none"
        }}/>
      ))}
      {/* Thumb */}
      <div style={{
        position: "absolute", left: `${pct}%`,
        transform: "translateX(-50%)",
        width: dragging ? 22 : 20, height: dragging ? 22 : 20,
        borderRadius: "50%",
        background: "white",
        boxShadow: `0 0 0 4px ${accent}30, 0 4px 14px ${accent}80, inset 0 -1px 0 rgba(0,0,0,0.1)`,
        cursor: "grab",
        transition: "width 120ms, height 120ms"
      }}>
        <span style={{
          position: "absolute", inset: 4, borderRadius: "50%",
          background: gradient
        }}/>
      </div>
    </div>
  );
};

window.PricingScreen = PricingScreen;

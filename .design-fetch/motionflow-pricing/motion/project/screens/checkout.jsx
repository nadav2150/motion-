/* Checkout — Premium subscription checkout flow.
   Reached from the paywall "Upgrade to Pro" CTA.
   Two columns: form left, summary + reassurance right. */

const CheckoutScreen = ({ onBack, onComplete, initialPlan = "annual" }) => {
  const [plan, setPlan] = useState(initialPlan);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);

  const plans = {
    monthly: { price: 24, sub: "/month", note: "Billed monthly", periodLabel: "Monthly" },
    annual:  { price: 19, sub: "/month", note: "Billed annually as $228 · 2 months free", periodLabel: "Annual", save: 60 },
  };
  const selected = plans[plan];
  const subtotal = plan === "annual" ? 228 : 24;
  const discount = promoApplied ? Math.round(subtotal * 0.10) : 0;
  const tax = Math.round((subtotal - discount) * 0.08);
  const total = subtotal - discount + tax;

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "auto",
      background: "var(--bg-0)", color: "var(--ink-0)",
      fontFamily: "'Geist', system-ui, sans-serif", position: "relative"
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: -200, left: "20%", width: 700, height: 700,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(circle, rgba(122,162,255,0.15), transparent 60%)",
        filter: "blur(60px)"
      }}/>
      <div style={{
        position: "absolute", top: 100, right: "10%", width: 500, height: 500,
        borderRadius: "50%", pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(circle, rgba(167,139,250,0.12), transparent 60%)",
        filter: "blur(60px)"
      }}/>

      {/* ─── Minimal header ─── */}
      <header style={{
        position: "relative", zIndex: 2,
        padding: "20px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--line)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <IconLogo size={26}/>
          <span style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: "-0.01em" }}>MotionFlow</span>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
          <CoStep n={1} done label="Pick plan"/>
          <CoSep/>
          <CoStep n={2} active label="Payment"/>
          <CoSep/>
          <CoStep n={3} label="Done"/>
        </div>

        <button onClick={onBack} style={{
          background: "transparent", border: "none", color: "var(--ink-2)",
          fontFamily: "inherit", fontSize: 13, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 6,
        }}>
          <IconClose size={12}/> Cancel
        </button>
      </header>

      <div style={{
        position: "relative", zIndex: 2,
        maxWidth: 1180, margin: "0 auto", padding: "40px 40px 80px",
        display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 40, alignItems: "start"
      }}>

        {/* ═══════════════════ LEFT — FORM ═══════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
              Complete your <span style={{
                background: "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
              }}>upgrade</span>
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Unlimited renders, premium engine, 4K export — start in seconds. Cancel anytime.
            </p>
          </div>

          {/* ── Plan switcher ── */}
          <CoSection title="01 · Choose your plan">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <CoPlanCard
                active={plan === "monthly"} onClick={()=>setPlan("monthly")}
                label="Monthly" price={24} sub="/month"
                note="Billed monthly · cancel anytime"
              />
              <CoPlanCard
                active={plan === "annual"} onClick={()=>setPlan("annual")}
                label="Annual" price={19} sub="/month"
                note="Billed $228/yr · 2 months free"
                badge="SAVE 20%"
              />
            </div>
          </CoSection>

          {/* ── Account ── */}
          <CoSection title="02 · Account">
            <CoField label="Email">
              <CoInput placeholder="you@company.com" type="email" defaultValue="alex@lattice.com"/>
            </CoField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <CoField label="First name">
                <CoInput placeholder="Alex" defaultValue="Alex"/>
              </CoField>
              <CoField label="Last name">
                <CoInput placeholder="Morgan" defaultValue="Morgan"/>
              </CoField>
            </div>
          </CoSection>

          {/* ── Payment ── */}
          <CoSection title="03 · Payment method">
            {/* Tabs */}
            <div style={{
              display: "flex", gap: 8, padding: 4, borderRadius: 10,
              background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)"
            }}>
              {[
                { k: "card",   l: "Card",         icon: <CoCardIcon/> },
                { k: "apple",  l: "Apple Pay",    icon: <CoAppleIcon/> },
                { k: "google", l: "Google Pay",   icon: <CoGoogleIcon/> },
              ].map(opt => {
                const active = paymentMethod === opt.k;
                return (
                  <button key={opt.k} onClick={()=>setPaymentMethod(opt.k)} style={{
                    flex: 1, padding: "10px 12px", borderRadius: 7, border: "none",
                    background: active ? "rgba(122,162,255,0.08)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px rgba(122,162,255,0.30)" : "none",
                    color: active ? "white" : "var(--ink-2)",
                    fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all 200ms"
                  }}>
                    <span style={{ color: active ? "#7AA2FF" : "var(--ink-3)", display: "grid", placeItems: "center" }}>{opt.icon}</span>
                    {opt.l}
                  </button>
                );
              })}
            </div>

            {paymentMethod === "card" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                <CoField label="Card number" right={<CoCardBrands/>}>
                  <CoInput placeholder="1234 1234 1234 1234" mono/>
                </CoField>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <CoField label="Expiry">
                    <CoInput placeholder="MM / YY" mono/>
                  </CoField>
                  <CoField label="CVC">
                    <CoInput placeholder="123" mono/>
                  </CoField>
                  <CoField label="Postal">
                    <CoInput placeholder="94103" mono/>
                  </CoField>
                </div>
                <CoField label="Cardholder name">
                  <CoInput placeholder="Name on card" defaultValue="Alex Morgan"/>
                </CoField>
              </div>
            ) : (
              <div style={{
                marginTop: 14, padding: "32px 20px", borderRadius: 12,
                background: "rgba(255,255,255,0.02)", border: "1px dashed var(--line-2)",
                textAlign: "center"
              }}>
                <div style={{ fontSize: 13, color: "var(--ink-1)", fontWeight: 500 }}>
                  {paymentMethod === "apple" ? "Apple Pay" : "Google Pay"} ready
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                  Confirm with Touch ID / device authentication
                </div>
              </div>
            )}

            {/* Billing country */}
            <div style={{ marginTop: 12 }}>
              <CoField label="Country / Region">
                <CoSelect defaultValue="us"/>
              </CoField>
            </div>
          </CoSection>
        </div>

        {/* ═══════════════════ RIGHT — SUMMARY ═══════════════════ */}
        <aside style={{ position: "sticky", top: 30, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Order summary card */}
          <div style={{
            position: "relative",
            padding: "26px 26px 22px",
            borderRadius: 16,
            background: "linear-gradient(180deg, #0E1018 0%, #08090E 100%)",
            border: "1px solid rgba(122,162,255,0.20)",
            boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden"
          }}>
            {/* Shimmer */}
            <div style={{
              position: "absolute", top: -60, right: -60, width: 280, height: 280,
              borderRadius: "50%", pointerEvents: "none",
              background: "radial-gradient(circle, rgba(122,162,255,0.18), transparent 60%)",
              filter: "blur(30px)"
            }}/>

            <div style={{ position: "relative" }}>
              <div className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "#7AA2FF", marginBottom: 14 }}>
                ORDER SUMMARY
              </div>

              {/* Product line */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: "linear-gradient(135deg, #7AA2FF, #A78BFA)",
                  display: "grid", placeItems: "center", color: "#0B0C10",
                  boxShadow: "0 6px 20px -4px rgba(122,162,255,0.45)"
                }}>
                  <IconSparkle size={18} stroke={2}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "white", letterSpacing: "-0.01em" }}>
                    Motion Pro
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                    {selected.periodLabel} · {selected.note}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "white" }}>
                    ${selected.price}<span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>{selected.sub}</span>
                  </div>
                  {plan === "annual" && (
                    <div className="mf-mono" style={{ fontSize: 9.5, letterSpacing: "0.06em", color: "#A6F0BD", marginTop: 4 }}>
                      SAVE ${selected.save}/YR
                    </div>
                  )}
                </div>
              </div>

              {/* Promo */}
              <div style={{ paddingTop: 14, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {!promoOpen ? (
                  <button onClick={()=>setPromoOpen(true)} style={{
                    background: "transparent", border: "none", padding: 0,
                    color: "#7AA2FF", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6
                  }}>
                    <IconPlus size={12}/> Add promo code
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={promo} onChange={(e)=>setPromo(e.target.value.toUpperCase())}
                      placeholder="LAUNCH10"
                      style={{
                        flex: 1, padding: "9px 12px", borderRadius: 8,
                        background: "rgba(0,0,0,0.3)", border: "1px solid var(--line)",
                        color: "white", fontSize: 12.5, fontFamily: "Geist Mono, monospace",
                        outline: "none", letterSpacing: "0.04em"
                      }}/>
                    <button onClick={()=>setPromoApplied(promo.length > 0)} style={{
                      padding: "0 14px", borderRadius: 8,
                      background: "rgba(255,255,255,0.06)", border: "1px solid var(--line-2)",
                      color: "white", fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer"
                    }}>Apply</button>
                  </div>
                )}
                {promoApplied && (
                  <div style={{
                    marginTop: 10, display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 6,
                    background: "rgba(166,240,189,0.06)", border: "1px solid rgba(166,240,189,0.25)",
                    fontSize: 11.5, color: "#A6F0BD"
                  }}>
                    <IconCheck size={11}/>
                    <span className="mf-mono" style={{ letterSpacing: "0.05em" }}>{promo}</span>
                    <span style={{ marginLeft: "auto", color: "rgba(166,240,189,0.7)", fontSize: 11 }}>−10% applied</span>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <CoRow label="Subtotal" value={`$${subtotal}.00`}/>
                {discount > 0 && <CoRow label="Promo discount" value={`−$${discount}.00`} accent/>}
                <CoRow label="Tax (est. 8%)" value={`$${tax}.00`} muted/>

                <div style={{
                  marginTop: 8, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline"
                }}>
                  <span style={{ fontSize: 14, color: "white", fontWeight: 500 }}>Total due today</span>
                  <span style={{ fontSize: 22, color: "white", fontWeight: 500, letterSpacing: "-0.02em" }}>
                    ${total}.00 <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, marginLeft: 4 }}>USD</span>
                  </span>
                </div>
                <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.06em", marginTop: 4 }}>
                  {plan === "annual" ? "RENEWS YEARLY · CANCEL ANYTIME" : "RENEWS MONTHLY · CANCEL ANYTIME"}
                </div>
              </div>
            </div>
          </div>

          {/* Primary CTA */}
          <button onClick={onComplete} style={{
            width: "100%", height: 52, borderRadius: 12,
            border: "1px solid rgba(167,139,250,0.50)",
            background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
            backgroundSize: "200% 100%",
            color: "#0B0C10", fontSize: 14.5, fontWeight: 600,
            fontFamily: "inherit", letterSpacing: "-0.005em",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 14px 36px -8px rgba(122,162,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            transition: "transform 160ms, background-position 600ms"
          }}
          onMouseEnter={(e)=>{ e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.backgroundPosition = "100% 0"; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.backgroundPosition = "0% 0"; }}>
            <span>Start subscription · ${total}.00</span>
            <IconArrowRight size={14}/>
          </button>

          {/* Trust strip */}
          <div style={{
            padding: "14px 18px", borderRadius: 12,
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
            display: "flex", flexDirection: "column", gap: 9
          }}>
            {[
              { i: <IconCheck size={11}/>,    t: "Cancel anytime — no questions" },
              { i: <IconCheck size={11}/>,    t: "30-day money-back guarantee" },
              { i: <CoLockIcon/>,               t: "Secured by Stripe · SSL encrypted" },
            ].map((it, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--ink-2)" }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: "rgba(166,240,189,0.10)", border: "1px solid rgba(166,240,189,0.30)",
                  color: "#A6F0BD", display: "grid", placeItems: "center", flexShrink: 0
                }}>{it.i}</span>
                {it.t}
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div style={{ padding: "14px 18px", borderRadius: 12, border: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ display: "flex" }}>
                {Array.from({length: 4}).map((_, i) => (
                  <div key={i} style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: `linear-gradient(135deg, oklch(0.72 0.18 ${230 + i*30}), oklch(0.55 0.18 ${280 + i*20}))`,
                    border: "2px solid var(--bg-0)", marginLeft: i===0 ? 0 : -7
                  }}/>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                Joined by <strong style={{ color: "white" }}>12,400+</strong> founders & teams
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45, fontStyle: "italic" }}>
              "Replaced our entire launch-video workflow. We ship in hours, not weeks."
            </div>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em", marginTop: 6 }}>
              — DANIEL R. · HEAD OF GROWTH @ VERCEL
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--ink-4)", textAlign: "center", lineHeight: 1.5, paddingTop: 6 }}>
            By starting your subscription, you agree to our{" "}
            <span style={{ color: "var(--ink-2)", cursor: "pointer" }}>Terms</span> and{" "}
            <span style={{ color: "var(--ink-2)", cursor: "pointer" }}>Privacy Policy</span>.
          </div>
        </aside>
      </div>
    </div>
  );
};

/* ───────── Sub-components ───────── */

const CoStep = ({ n, label, active, done }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
    <span style={{
      width: 20, height: 20, borderRadius: "50%",
      display: "grid", placeItems: "center",
      fontSize: 10.5, fontWeight: 600, fontFamily: "Geist Mono, monospace",
      background: active ? "linear-gradient(135deg, #7AA2FF, #A78BFA)" : done ? "rgba(166,240,189,0.15)" : "rgba(255,255,255,0.04)",
      color: active ? "#0B0C10" : done ? "#A6F0BD" : "var(--ink-3)",
      border: done ? "1px solid rgba(166,240,189,0.35)" : active ? "none" : "1px solid var(--line)",
      boxShadow: active ? "0 4px 14px rgba(122,162,255,0.45)" : "none"
    }}>{done ? "✓" : n}</span>
    <span style={{ fontSize: 12.5, color: active ? "white" : done ? "var(--ink-2)" : "var(--ink-3)", fontWeight: active ? 500 : 400 }}>
      {label}
    </span>
  </div>
);

const CoSep = () => <div style={{ width: 20, height: 1, background: "var(--line)" }}/>;

const CoSection = ({ title, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="mf-mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", color: "var(--ink-3)" }}>
      {title.toUpperCase()}
    </div>
    {children}
  </div>
);

const CoPlanCard = ({ active, onClick, label, price, sub, note, badge }) => (
  <button onClick={onClick} style={{
    position: "relative",
    padding: "16px 18px", textAlign: "left", borderRadius: 12,
    background: active ? "linear-gradient(180deg, rgba(122,162,255,0.08), rgba(167,139,250,0.04))" : "rgba(255,255,255,0.02)",
    border: `1px solid ${active ? "rgba(122,162,255,0.40)" : "var(--line)"}`,
    boxShadow: active ? "0 8px 24px -8px rgba(122,162,255,0.30)" : "none",
    cursor: "pointer", fontFamily: "inherit",
    transition: "all 240ms cubic-bezier(.2,.8,.2,1)"
  }}>
    {badge && (
      <span className="mf-mono" style={{
        position: "absolute", top: 12, right: 12,
        fontSize: 9, letterSpacing: "0.08em",
        padding: "2.5px 6px", borderRadius: 4,
        background: active ? "linear-gradient(135deg, #7AA2FF, #A78BFA)" : "rgba(166,240,189,0.14)",
        color: active ? "#0B0C10" : "#A6F0BD",
        border: active ? "none" : "1px solid rgba(166,240,189,0.30)",
        fontWeight: 600
      }}>{badge}</span>
    )}
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        background: active ? "white" : "transparent",
        border: `1.5px solid ${active ? "white" : "var(--line-2)"}`,
        display: "grid", placeItems: "center", flexShrink: 0
      }}>
        {active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7AA2FF" }}/>}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: "white" }}>{label}</span>
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", color: "white" }}>${price}</span>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</span>
    </div>
    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>{note}</div>
  </button>
);

const CoField = ({ label, children, right }) => (
  <label style={{ display: "block" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 11.5, color: "var(--ink-2)", fontWeight: 500, letterSpacing: "-0.005em" }}>{label}</span>
      {right}
    </div>
    {children}
  </label>
);

const CoInput = ({ placeholder, type = "text", defaultValue, mono }) => (
  <input
    type={type}
    placeholder={placeholder}
    defaultValue={defaultValue}
    style={{
      width: "100%", boxSizing: "border-box",
      padding: "11px 14px", borderRadius: 9,
      background: "rgba(0,0,0,0.25)",
      border: "1px solid var(--line)",
      color: "white", fontSize: 13.5,
      fontFamily: mono ? "Geist Mono, monospace" : "inherit",
      letterSpacing: mono ? "0.02em" : "normal",
      outline: "none",
      transition: "border-color 160ms, background 160ms"
    }}
    onFocus={(e)=>{ e.target.style.borderColor = "rgba(122,162,255,0.45)"; e.target.style.background = "rgba(0,0,0,0.35)"; }}
    onBlur={(e)=>{ e.target.style.borderColor = "var(--line)"; e.target.style.background = "rgba(0,0,0,0.25)"; }}
  />
);

const CoSelect = ({ defaultValue }) => (
  <div style={{ position: "relative" }}>
    <select defaultValue={defaultValue} style={{
      width: "100%", appearance: "none", WebkitAppearance: "none",
      padding: "11px 14px", paddingRight: 36, borderRadius: 9,
      background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)",
      color: "white", fontSize: 13.5, fontFamily: "inherit", outline: "none", cursor: "pointer"
    }}>
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
      <option value="de">Germany</option>
      <option value="fr">France</option>
      <option value="il">Israel</option>
      <option value="ca">Canada</option>
      <option value="au">Australia</option>
    </select>
    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-3)" }}>
      <IconChevron size={14}/>
    </span>
  </div>
);

const CoRow = ({ label, value, accent, muted }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5,
    color: accent ? "#A6F0BD" : muted ? "var(--ink-3)" : "var(--ink-2)" }}>
    <span>{label}</span>
    <span style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>{value}</span>
  </div>
);

/* Minimal payment / lock glyphs (kept inline to avoid icon set bloat) */
const CoCardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/><path d="M6 16h3"/>
  </svg>
);
const CoAppleIcon = () => (
  <svg width="13" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.4 12.6c0-2.7 2.2-4 2.3-4-.6-1.9-2.3-2.2-2.9-2.2-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.5-.4 6.2 1 8.2.6 1 1.4 2.2 2.4 2.1 1 0 1.3-.6 2.5-.6 1.2 0 1.5.6 2.5.6 1 0 1.7-1 2.4-2 .8-1.2 1.1-2.3 1.1-2.3-.1 0-2.4-1-2.4-3.8M14.4 4.6c.6-.7 1-1.7.8-2.6-.8 0-1.7.6-2.3 1.2-.5.6-1 1.6-.9 2.5.9.1 1.8-.5 2.4-1.1"/>
  </svg>
);
const CoGoogleIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.6c-.2 1.3-1 2.4-2.1 3.1v2.5h3.4c2-1.8 3.1-4.5 3.1-7.7"/>
    <path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.4-2.5c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.4-4H3v2.5C4.7 19.9 8.1 22 12 22"/>
    <path d="M6.6 14c-.2-.6-.3-1.2-.3-2s.1-1.4.3-2V7.5H3C2.4 8.8 2 10.4 2 12s.4 3.2 1 4.5z"/>
    <path d="M12 6c1.4 0 2.7.5 3.7 1.5l2.8-2.7C16.9 3.2 14.7 2 12 2 8.1 2 4.7 4.1 3 7.5l3.6 2.5C7.3 7.7 9.5 6 12 6"/>
  </svg>
);
const CoLockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </svg>
);

const CoCardBrands = () => (
  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
    {["VISA", "MC", "AMEX"].map(b => (
      <span key={b} className="mf-mono" style={{
        fontSize: 8.5, letterSpacing: "0.06em", fontWeight: 600,
        padding: "2px 5px", borderRadius: 3,
        background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
        color: "var(--ink-3)"
      }}>{b}</span>
    ))}
  </div>
);

window.CheckoutScreen = CheckoutScreen;

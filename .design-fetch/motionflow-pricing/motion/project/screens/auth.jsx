/* Auth — Login & Register screens (cinematic split) */

const AuthScreen = ({ mode = "login", onSwitch, onSubmit, onBack }) => {
  const f = useFrame();
  const isLogin = mode === "login";
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);

  // Password strength (register)
  const strength = (() => {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  })();
  const strLabel = ["Empty", "Weak", "Fair", "Strong", "Excellent"][strength];
  const strColor = ["var(--ink-4)", "#F87171", "#FBBF24", "#A6F0BD", "#67E8F9"][strength];

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden",
      background: "#06070A", color: "var(--ink-1)",
      display: "grid", gridTemplateColumns: "1.05fr 1fr"
    }}>
      {/* ─── LEFT: Cinematic stage ─── */}
      <div style={{ position: "relative", overflow: "hidden", borderRight: "1px solid var(--line)" }}>
        {/* Animated aurora bloom */}
        <div style={{
          position: "absolute", inset: 0,
          background: `
            radial-gradient(900px 600px at ${30 + Math.sin(f/120)*8}% ${25 + Math.cos(f/140)*6}%, rgba(122,162,255,0.22), transparent 55%),
            radial-gradient(700px 500px at ${75 + Math.sin(f/100)*6}% ${75 + Math.cos(f/130)*8}%, rgba(167,139,250,0.18), transparent 55%),
            radial-gradient(500px 400px at 50% 110%, rgba(103,232,249,0.12), transparent 55%)
          `,
          filter: "blur(10px)"
        }}/>

        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.32,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)"
        }}/>

        {/* Floating cinema cards (parallax) */}
        <div style={{ position: "absolute", inset: 0 }}>
          {[
            { x: 12, y: 18, w: 280, h: 160, rot: -5, c: "linear-gradient(135deg, #5468FF, #2D3340)", label: "01 · COLD OPEN", del: 0 },
            { x: 56, y: 10, w: 220, h: 140, rot: 4,  c: "linear-gradient(135deg, #7AA2FF, #A78BFA)", label: "02 · HERO REVEAL", del: 1 },
            { x: 28, y: 52, w: 320, h: 190, rot: -2, c: "linear-gradient(135deg, #A78BFA, #67E8F9)", label: "03 · FEATURE MACRO", del: 2 },
            { x: 64, y: 56, w: 240, h: 150, rot: 6,  c: "linear-gradient(135deg, #1F2937, #5468FF)", label: "04 · WORKFLOW", del: 3 },
          ].map((c, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${c.x}%`, top: `${c.y}%`,
              width: c.w, height: c.h,
              borderRadius: 14,
              background: c.c,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
              transform: `translateY(${Math.sin((f + c.del*40)/60)*6}px) rotate(${c.rot + Math.sin((f + c.del*30)/80)*0.6}deg)`,
              transition: "transform 200ms",
              overflow: "hidden"
            }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%)" }}/>
              <div className="mf-mono" style={{ position: "absolute", top: 10, left: 12, fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.75)" }}>{c.label}</div>
              <div style={{ position: "absolute", left: 12, right: 12, bottom: 10, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${30 + (i*15) + Math.sin((f + c.del*20)/40)*10}%`, background: "white", borderRadius: 2 }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Top brand row */}
        <div style={{ position: "absolute", top: 28, left: 32, display: "flex", alignItems: "center", gap: 10, zIndex: 3 }}>
          <IconLogo size={26}/>
          <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em" }}>Videly AI</span>
        </div>

        {/* Bottom quote */}
        <div style={{
          position: "absolute", left: 32, right: 32, bottom: 32, zIndex: 3,
          padding: "22px 24px", borderRadius: 16,
          background: "rgba(8,9,13,0.55)", backdropFilter: "blur(20px)",
          border: "1px solid var(--line)"
        }}>
          <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 10 }}>WHAT TEAMS BUILD HERE</div>
          <div style={{ fontSize: 22, lineHeight: 1.35, fontWeight: 500, letterSpacing: "-0.015em", textWrap: "pretty" }}>
            "We shipped our launch film in <span className="mf-grad-text">3 hours</span>, not 3 weeks. No agency, no Premiere, no compromise."
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #7AA2FF, #A78BFA)", border: "1px solid rgba(255,255,255,0.15)" }}/>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>Maya Okonkwo</div>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>HEAD OF BRAND · LATTICE</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: Form ─── */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "32px 56px", overflow: "auto" }}>
        {/* Top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onBack} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "none", color: "var(--ink-3)",
            fontSize: 12, cursor: "pointer", fontFamily: "inherit"
          }}>
            <IconChevron size={12} style={{ transform: "rotate(90deg)" }}/> Back to site
          </button>
          <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)" }}>
            {isLogin ? "NEW HERE?" : "ALREADY HAVE AN ACCOUNT?"} <button onClick={onSwitch} style={{ background:"transparent", border:"none", color:"#DCE4FF", cursor:"pointer", fontFamily:"inherit", letterSpacing:"inherit", fontSize: "inherit", marginLeft: 6, textDecoration: "underline", textDecorationColor: "rgba(220,228,255,0.35)" }}>{isLogin ? "Create an account" : "Sign in instead"}</button>
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 420, margin: "0 auto", width: "100%", paddingTop: 24, paddingBottom: 24 }}>
          <div className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 12 }}>
            {isLogin ? "WELCOME BACK" : "JOIN VIDELY"}
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            {isLogin
              ? <>Direct your next <span className="mf-grad-text">cinematic</span> launch.</>
              : <>Make a launch film <span className="mf-grad-text">in hours</span>, not weeks.</>}
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {isLogin
              ? "Sign in to continue your storyboard, render queue, and saved brand kits."
              : "Free 5 generations to start. No credit card. Cancel anytime."}
          </p>

          {/* OAuth */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 26 }}>
            <OAuthBtn icon={<GoogleG/>}>Continue with Google</OAuthBtn>
            <OAuthBtn icon={<AppleA/>}>Continue with Apple</OAuthBtn>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 6px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }}/>
            <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.14em" }}>OR WITH EMAIL</span>
            <div style={{ flex: 1, height: 1, background: "var(--line)" }}/>
          </div>

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {!isLogin && (
              <AuthField label="Full name" value={name} onChange={setName} placeholder="Maya Okonkwo"/>
            )}
            <AuthField label="Work email" value={email} onChange={setEmail} placeholder="you@studio.com" type="email"/>
            <AuthField
              label={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span>Password</span>
                  {isLogin && <a href="#" style={{ fontSize: 11, color: "var(--ink-3)", textDecoration: "none" }}>Forgot?</a>}
                </div>
              }
              value={pwd} onChange={setPwd}
              type={show ? "text" : "password"}
              placeholder={isLogin ? "Enter password" : "8+ chars, mix of cases & numbers"}
              right={
                <button onClick={()=>setShow(!show)} style={{ background:"transparent", border:"none", color:"var(--ink-3)", cursor:"pointer", fontFamily:"inherit", fontSize: 11, padding: "0 4px" }}>
                  {show ? "Hide" : "Show"}
                </button>
              }
            />
            {!isLogin && (
              <div style={{ marginTop: 2 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i < strength ? strColor : "var(--line-2)",
                      transition: "background 200ms"
                    }}/>
                  ))}
                </div>
                <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                  STRENGTH · <span style={{ color: strColor }}>{strLabel.toUpperCase()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Register: agree */}
          {!isLogin && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, cursor: "pointer" }}>
              <span onClick={()=>setAgree(!agree)} style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                border: `1px solid ${agree ? "rgba(122,162,255,0.6)" : "var(--line-2)"}`,
                background: agree ? "var(--grad-aurora)" : "transparent",
                display: "grid", placeItems: "center", color: "#0B0C10",
                transition: "all 180ms"
              }}>
                {agree && <IconCheck size={11} stroke={3}/>}
              </span>
              <span>I agree to the <a href="#" style={{ color: "#DCE4FF" }}>Terms</a> and <a href="#" style={{ color: "#DCE4FF" }}>Privacy Policy</a>, and to receive occasional launch tips.</span>
            </label>
          )}

          {/* Login: remember */}
          {isLogin && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>
              <span onClick={()=>setAgree(!agree)} style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                border: `1px solid ${agree ? "rgba(122,162,255,0.6)" : "var(--line-2)"}`,
                background: agree ? "var(--grad-aurora)" : "transparent",
                display: "grid", placeItems: "center", color: "#0B0C10",
                transition: "all 180ms"
              }}>
                {agree && <IconCheck size={11} stroke={3}/>}
              </span>
              <span>Remember me on this device</span>
            </label>
          )}

          {/* Submit */}
          <div style={{ marginTop: 22 }}>
            <button onClick={onSubmit} style={{
              width: "100%", height: 44, borderRadius: 10,
              border: "1px solid rgba(167,139,250,0.45)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              color: "#0B0C10", fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
              fontFamily: "inherit", cursor: "pointer",
              boxShadow: "0 8px 28px rgba(122,162,255,0.32), inset 0 1px 0 rgba(255,255,255,0.22)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8
            }}>
              {isLogin ? "Sign in" : "Create account"}
              <IconArrowRight size={14}/>
            </button>
          </div>

          {/* SSO row */}
          <div style={{ marginTop: 18, padding: "14px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "rgba(255,255,255,0.025)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>Workspace SSO</div>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 2 }}>SAML · OKTA · GOOGLE WORKSPACE</div>
            </div>
            <button style={{
              padding: "0 12px", height: 28, borderRadius: 8,
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
              color: "var(--ink-1)", fontSize: 11.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit"
            }}>Use SSO</button>
          </div>

          <div style={{ marginTop: 22, textAlign: "center", fontSize: 11, color: "var(--ink-4)", lineHeight: 1.5 }}>
            Protected by reCAPTCHA · We never sell your data
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthField = ({ label, value, onChange, placeholder, type = "text", right }) => {
  const [focus, setFocus] = useState(false);
  return (
    <label style={{ display: "block" }}>
      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 6 }}>
        {(typeof label === "string") ? String(label).toUpperCase() : label}
      </div>
      <div style={{
        position: "relative",
        height: 42, borderRadius: 10,
        background: "rgba(0,0,0,0.30)",
        border: `1px solid ${focus ? "rgba(122,162,255,0.5)" : "var(--line)"}`,
        boxShadow: focus ? "0 0 0 3px rgba(122,162,255,0.12)" : "none",
        transition: "all 180ms",
        display: "flex", alignItems: "center"
      }}>
        <input
          type={type}
          value={value}
          onChange={(e)=>onChange(e.target.value)}
          onFocus={()=>setFocus(true)}
          onBlur={()=>setFocus(false)}
          placeholder={placeholder}
          style={{
            flex: 1, height: "100%", padding: "0 12px",
            background: "transparent", border: "none", outline: "none",
            color: "var(--ink-1)", fontSize: 13.5, fontFamily: "inherit"
          }}
        />
        {right && <div style={{ paddingRight: 8 }}>{right}</div>}
      </div>
    </label>
  );
};

const OAuthBtn = ({ icon, children }) => (
  <button style={{
    height: 42, borderRadius: 10,
    background: "rgba(255,255,255,0.035)", border: "1px solid var(--line)",
    color: "var(--ink-1)", fontSize: 12.5, fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8
  }}>
    {icon}<span>{children}</span>
  </button>
);

const GoogleG = () => (
  <svg width="14" height="14" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6L12 10.2z"/>
  </svg>
);
const AppleA = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12.3c0-2.5 2.1-3.7 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.6-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.2 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3 0 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.2-1.2 3.1-2.4 1-1.4 1.4-2.7 1.4-2.8 0-.1-2.8-1.1-2.8-4.2zM14 5c.7-.8 1.2-2 1-3.2-1 .1-2.3.7-3 1.5-.7.7-1.3 2-1.1 3.1 1.2.1 2.4-.5 3.1-1.4z"/>
  </svg>
);

window.AuthScreen = AuthScreen;

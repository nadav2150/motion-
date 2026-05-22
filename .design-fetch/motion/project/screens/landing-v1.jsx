/* Screen 1 — Landing Hero */
const LandingScreen = ({ onCta }) => {
  const f = useFrame();
  const [drag, setDrag] = useState(false);

  return (
    <div className="mf-screen">
      <div className="mf-bg-bloom"/>
      <div className="mf-bg-grid"/>
      <div className="mf-bg-noise"/>

      <TopNav onCta={onCta}/>

      <section style={{ position: "relative", zIndex: 2, padding: "80px 56px 120px", maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 28 }}>
          <Pill tone="glow" icon={<IconSparkle size={11}/>}>
            <span className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.08em" }}>NEW · MOTION ENGINE v2</span>
          </Pill>

          <h1 className="mf-display" style={{ margin: 0, maxWidth: 1100 }}>
            Turn screenshots into<br/>
            <span className="mf-grad-text">cinematic launch videos.</span>
          </h1>

          <p className="mf-body" style={{ maxWidth: 580, fontSize: 18, color: "var(--ink-2)" }}>
            Videly generates broadcast-grade product films from your UI, script and brand —
            in under sixty seconds. No editor required.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Button variant="primary" size="lg" onClick={onCta} iconRight={<IconArrowRight size={16}/>}>Generate video</Button>
            <Button variant="ghost" size="lg" icon={<IconPlay size={14}/>}>Watch reel · 1:24</Button>
          </div>

          <div className="mf-mono" style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.16em" }}>
            TRUSTED BY TEAMS AT &nbsp;·&nbsp; LATTICE &nbsp;·&nbsp; FIGMA &nbsp;·&nbsp; ARC &nbsp;·&nbsp; HEX &nbsp;·&nbsp; CRESTA
          </div>
        </div>

        {/* Hero showcase */}
        <div style={{ position: "relative", marginTop: 88 }}>
          {/* Floating UI cards */}
          <FloatingCard pos={{ left: -40, top: 40 }} delay={0}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--grad-aurora)", display:"grid", placeItems:"center" }}>
                <IconWand size={14} stroke={2} style={{ color: "white" }}/>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Scene 03 · Hero reveal</div>
                <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em" }}>00:04.21 → 00:07.80</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 24 }}>
              {Array.from({length: 28}).map((_,i) => (
                <div key={i} style={{
                  width: 2, height: `${30 + Math.sin((f+i*8)/12)*40 + 30}%`,
                  background: i < 18 ? "linear-gradient(180deg, #7AA2FF, #A78BFA)" : "rgba(255,255,255,0.15)",
                  borderRadius: 1
                }}/>
              ))}
            </div>
          </FloatingCard>

          <FloatingCard pos={{ right: -32, top: 80 }} delay={2}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span className="mf-pill mf-pill-success" style={{ padding: "3px 8px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#67E8F9", boxShadow: "0 0 10px #67E8F9" }}/>
                LIVE
              </span>
              <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>RENDERING · 4K</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Generating motion path…</div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${(Math.sin(f/30)*0.4+0.6)*100}%`, height: "100%", background: "var(--grad-aurora)" }}/>
            </div>
            <div className="mf-mono" style={{ marginTop: 8, fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em", display: "flex", justifyContent: "space-between" }}>
              <span>FRAME 1,284 / 2,160</span><span>{(8 + Math.sin(f/30)*1.2).toFixed(1)}s</span>
            </div>
          </FloatingCard>

          <FloatingCard pos={{ right: 60, bottom: -30 }} delay={1}>
            <div className="mf-eyebrow" style={{ marginBottom: 8 }}>STYLE PRESET</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Linear","Apple","Hype"].map((s,i) => (
                <span key={s} style={{
                  padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                  background: i===0 ? "rgba(255,255,255,0.10)" : "transparent",
                  border: `1px solid ${i===0 ? "rgba(122,162,255,0.4)" : "var(--line)"}`,
                  color: i===0 ? "white" : "var(--ink-2)"
                }}>{s}</span>
              ))}
            </div>
          </FloatingCard>

          {/* Main cinema preview with drop zone overlay */}
          <div style={{ position: "relative", maxWidth: 980, margin: "0 auto" }}>
            <CinemaPreview aspect="16 / 9" frame={f} label="VIDELY · PREVIEW · 4K · 24FPS">
              {/* Centered drop zone */}
              <div
                onDragOver={(e)=>{e.preventDefault(); setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={(e)=>{e.preventDefault(); setDrag(false); onCta?.();}}
                onClick={onCta}
                style={{
                  position: "absolute", inset: "50% 0 0 0", transform: "translateY(-50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer"
                }}>
                <div style={{
                  padding: "44px 64px", borderRadius: 24,
                  background: "rgba(8,9,13,0.5)",
                  backdropFilter: "blur(40px) saturate(160%)",
                  border: `1px ${drag ? "solid" : "dashed"} ${drag ? "rgba(122,162,255,0.6)" : "rgba(255,255,255,0.18)"}`,
                  boxShadow: drag ? "0 0 0 4px rgba(122,162,255,0.15), 0 30px 80px -20px rgba(122,162,255,0.4)" : "0 30px 80px -20px rgba(0,0,0,0.6)",
                  transition: "all 300ms cubic-bezier(.2,.8,.2,1)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 14, minWidth: 380
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: "linear-gradient(135deg, rgba(122,162,255,0.20), rgba(167,139,250,0.10))",
                    border: "1px solid rgba(122,162,255,0.30)",
                    display: "grid", placeItems: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)"
                  }}>
                    <IconUpload size={22} stroke={1.5} style={{ color: "#DCE4FF" }}/>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>
                      Drop screenshots to begin
                    </div>
                    <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 6 }}>
                      PNG · JPG · MP4 · FIGMA · UP TO 200 MB
                    </div>
                  </div>
                  <Button variant="glow" size="md" onClick={onCta} iconRight={<IconArrowRight size={14}/>}>Generate Video</Button>
                </div>
              </div>
            </CinemaPreview>

            {/* Caption row under preview */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, padding: "0 8px" }}>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em" }}>
                LIVE PREVIEW
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {["00:00","00:15","00:30","00:45","01:00"].map(t => (
                  <span key={t} className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.1em" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feature row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 120, background: "var(--line)", border: "1px solid var(--line)", borderRadius: 18, overflow: "hidden" }}>
          {[
            { k: "01", t: "Auto-storyboard", d: "Detects flows, frames key beats, sequences scenes."},
            { k: "02", t: "Cinematic motion", d: "Camera moves, depth, parallax — physics-aware."},
            { k: "03", t: "Brand-locked", d: "Colors, type, logo applied across every frame."},
            { k: "04", t: "Export anywhere", d: "4K MP4, vertical reels, lottie, embeddable links."},
          ].map(c => (
            <div key={c.k} style={{ background: "rgba(8,9,13,0.6)", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.16em" }}>{c.k}</div>
              <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>{c.t}</div>
              <div className="mf-body" style={{ fontSize: 13, color: "var(--ink-3)" }}>{c.d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const FloatingCard = ({ children, pos, delay = 0 }) => (
  <div
    className="mf-glass mf-float"
    style={{
      position: "absolute",
      ...pos,
      padding: "14px 16px",
      minWidth: 200,
      zIndex: 4,
      animationDelay: `${delay}s`,
      borderRadius: 14,
    }}>
    {children}
  </div>
);

window.LandingScreen = LandingScreen;

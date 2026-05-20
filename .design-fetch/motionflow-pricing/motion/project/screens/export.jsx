/* Screen 5 — Export / Share */
const ExportScreen = ({ onNav }) => {
  const f = useFrame();
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState("mp4-4k");

  const link = "motionflow.ai/v/lattice-q4-launch";

  return (
    <AppChrome
      active="export"
      onNav={onNav}
      project="Lattice — Q4 launch"
      right={
        <>
          <Pill tone="success" icon={<IconCheck size={11} stroke={2.5}/>}>
            <span className="mf-mono" style={{fontSize:10, letterSpacing:"0.08em"}}>EXPORT READY</span>
          </Pill>
          <Button variant="ghost" size="sm">New project</Button>
        </>
      }>
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: "48px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 36, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="mf-eyebrow" style={{ marginBottom: 12 }}>STEP 04 · DELIVER</div>
            <h1 className="mf-h1" style={{ margin: 0, fontSize: 48 }}>
              Your launch film is <span className="mf-grad-text">ready.</span>
            </h1>
            <div className="mf-body" style={{ marginTop: 10, fontSize: 15, color: "var(--ink-2)" }}>
              60 seconds · 4K · 1,284 frames · rendered in 47 seconds.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" size="md" icon={<IconWand size={14}/>}>Regenerate variants</Button>
            <Button variant="primary" size="md" icon={<IconDownload size={14}/>}>Download · MP4</Button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28 }}>
          {/* Left: hero preview + analytics */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ position: "relative" }}>
              <CinemaPreview aspect="16 / 9" frame={f} label="LATTICE — Q4 LAUNCH · FINAL CUT">
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <button style={{
                    width: 84, height: 84, borderRadius: "50%",
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)",
                    backdropFilter: "blur(20px)", color: "white", cursor: "pointer",
                    display: "grid", placeItems: "center", paddingLeft: 6,
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 30px 80px -20px rgba(0,0,0,0.6)"
                  }}>
                    <IconPlay size={28}/>
                  </button>
                </div>
                <div style={{ position: "absolute", bottom: 18, right: 18, display: "flex", gap: 8 }}>
                  <Pill icon={<span className="mf-mono">4K</span>}><span className="mf-mono" style={{fontSize:10,letterSpacing:"0.08em"}}>2160p</span></Pill>
                  <Pill><span className="mf-mono" style={{fontSize:10,letterSpacing:"0.08em"}}>00:60.00</span></Pill>
                </div>
              </CinemaPreview>
            </div>

            {/* Frame strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {[
                "linear-gradient(135deg, #1F2937, #06070A)",
                "linear-gradient(135deg, #5468FF, #2D3340)",
                "linear-gradient(135deg, #7AA2FF, #A78BFA)",
                "linear-gradient(135deg, #A78BFA, #67E8F9)",
                "linear-gradient(135deg, #1F2937, #5468FF)",
                "linear-gradient(135deg, #67E8F9, #7AA2FF)",
              ].map((c, i) => (
                <div key={i} style={{
                  aspectRatio: "16/9", borderRadius: 8, background: c,
                  border: "1px solid var(--line)", position: "relative", overflow: "hidden"
                }}>
                  <div className="mf-mono" style={{ position: "absolute", top: 6, left: 7, fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>0{i+1}</div>
                </div>
              ))}
            </div>

            {/* Analytics */}
            <Glass style={{ padding: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div className="mf-eyebrow">PROJECTED REACH</div>
                <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>BASED ON 12K SIMILAR LAUNCHES</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
                {[
                  { k: "Est. plays", v: "184K", d: "+38%" },
                  { k: "Avg. watch", v: "47s", d: "78% completion" },
                  { k: "Engagement", v: "8.4%", d: "vs 3.2% benchmark" },
                  { k: "CTR (CTA)", v: "12.1%", d: "Strong intent" },
                ].map(s => (
                  <div key={s.k} style={{ borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
                    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 6 }}>{s.k.toUpperCase()}</div>
                    <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{s.v}</div>
                    <div className="mf-mono" style={{ fontSize: 10, color: "#A6F0BD", letterSpacing: "0.04em", marginTop: 4 }}>{s.d}</div>
                  </div>
                ))}
              </div>
            </Glass>
          </div>

          {/* Right: export options + social */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Format options */}
            <Glass style={{ padding: 24 }}>
              <div className="mf-eyebrow" style={{ marginBottom: 16 }}>EXPORT FORMATS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { k: "mp4-4k", t: "MP4 · 4K · 16:9", d: "Master · 248 MB" },
                  { k: "mp4-1080", t: "MP4 · 1080p · 16:9", d: "Web · 84 MB" },
                  { k: "vertical", t: "Vertical Reel · 9:16", d: "Social · 92 MB" },
                  { k: "lottie", t: "Lottie JSON", d: "Embeddable · 1.2 MB" },
                ].map(o => (
                  <button key={o.k} onClick={()=>setFormat(o.k)} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: format===o.k ? "rgba(122,162,255,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${format===o.k ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
                    cursor: "pointer", textAlign: "left", color: "inherit"
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{o.t}</div>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em", marginTop: 2 }}>{o.d}</div>
                    </div>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: `1.5px solid ${format===o.k ? "#7AA2FF" : "var(--line-2)"}`,
                      display: "grid", placeItems: "center"
                    }}>
                      {format===o.k && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#7AA2FF" }}/>}
                    </div>
                  </button>
                ))}
              </div>
            </Glass>

            {/* Share link */}
            <Glass style={{ padding: 24 }}>
              <div className="mf-eyebrow" style={{ marginBottom: 14 }}>SHAREABLE LINK</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)"
              }}>
                <IconLink size={13} style={{ color: "var(--ink-3)" }}/>
                <span className="mf-mono" style={{ flex: 1, fontSize: 12, color: "var(--ink-1)", letterSpacing: "0.02em" }}>{link}</span>
                <button onClick={()=>{setCopied(true); setTimeout(()=>setCopied(false), 1500);}} style={{
                  padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: copied ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : "var(--line-2)"}`,
                  color: copied ? "#A6F0BD" : "var(--ink-0)",
                  cursor: "pointer"
                }}>{copied ? "Copied" : "Copy"}</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button variant="ghost" size="sm">Password</Button>
                <Button variant="ghost" size="sm">Expires in 30d</Button>
                <Button variant="ghost" size="sm">Allow embed</Button>
              </div>
            </Glass>

            {/* Social preview cards */}
            <Glass style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div className="mf-eyebrow">SOCIAL PREVIEW</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["X","LI","IG"].map(p => (
                    <span key={p} className="mf-mono" style={{
                      width: 26, height: 22, borderRadius: 5, background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--line)", display: "grid", placeItems: "center",
                      fontSize: 9, color: "var(--ink-2)", letterSpacing: "0.06em"
                    }}>{p}</span>
                  ))}
                </div>
              </div>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
                <div style={{
                  aspectRatio: "1.91/1", background: "linear-gradient(135deg, #7AA2FF, #A78BFA)", position: "relative", overflow: "hidden"
                }}>
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4), transparent 50%)" }}/>
                  <div style={{ position: "absolute", left: 16, bottom: 14, color: "white" }}>
                    <div className="mf-mono" style={{ fontSize: 9, letterSpacing: "0.16em", opacity: 0.7 }}>MOTIONFLOW · LATTICE</div>
                    <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.015em", marginTop: 4 }}>Built for teams that ship.</div>
                  </div>
                </div>
                <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>Lattice — Q4 launch film</div>
                  <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 2 }}>MOTIONFLOW.AI</div>
                </div>
              </div>
            </Glass>
          </div>
        </div>
      </div>
    </AppChrome>
  );
};

window.ExportScreen = ExportScreen;

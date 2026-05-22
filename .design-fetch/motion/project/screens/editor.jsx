/* Screen 4 — Editor / Timeline (main screen) */
const EditorScreen = ({ onNav, onContinue, empty = false }) => {
  const f = useFrame();
  const [playing, setPlaying] = useState(true);
  const [selected, setSelected] = useState(2);
  const [time, setTime] = useState(12.4);
  const [leftTab, setLeftTab] = useState(empty ? "assets" : "scenes"); // null = collapsed
  const [isEmpty, setIsEmpty] = useState(empty);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTime(t => (t + 0.1) % 60), 100);
    return () => clearInterval(id);
  }, [playing]);

  const scenes = [
    { t: "Cold open", d: 8, c: "linear-gradient(135deg, #1F2937, #06070A)" },
    { t: "Logo reveal", d: 6, c: "linear-gradient(135deg, #5468FF, #2D3340)" },
    { t: "Hero feature", d: 14, c: "linear-gradient(135deg, #7AA2FF, #A78BFA)" },
    { t: "Workflow", d: 12, c: "linear-gradient(135deg, #A78BFA, #67E8F9)" },
    { t: "Testimonial", d: 10, c: "linear-gradient(135deg, #1F2937, #5468FF)" },
    { t: "CTA", d: 10, c: "linear-gradient(135deg, #67E8F9, #7AA2FF)" },
  ];

  const presets = [
    { t: "Slow push-in", d: "3.2s · ease-out" },
    { t: "Lateral pan", d: "4.0s · linear" },
    { t: "Depth parallax", d: "5.6s · cubic" },
    { t: "Reveal stack", d: "2.8s · spring" },
  ];

  return (
    <AppChrome
      active="editor"
      onNav={onNav}
      project={isEmpty ? "Untitled project" : "Lattice — Q4 launch"}
      right={
        <>
          {isEmpty ? (
            <Pill icon={<span style={{width:6,height:6,borderRadius:"50%",background:"#7AA2FF"}}/>}>
              <span className="mf-mono" style={{fontSize:10, letterSpacing:"0.08em"}}>NEW PROJECT · DRAFT</span>
            </Pill>
          ) : (
            <Pill icon={<span style={{width:6,height:6,borderRadius:"50%",background:"#A6F0BD"}}/>}>
              <span className="mf-mono" style={{fontSize:10, letterSpacing:"0.08em"}}>SAVED 2s AGO</span>
            </Pill>
          )}
          <Button variant="ghost" size="sm" icon={<IconShare size={12}/>}>Share preview</Button>
          <GenerateButton onClick={()=>setIsEmpty(false)}/>
          <Button variant="ghost" size="sm" onClick={onContinue} iconRight={<IconArrowRight size={12}/>}>Export</Button>
        </>
      }>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100%" }}>
       <div style={{ display: "grid", gridTemplateColumns: `48px ${leftTab ? "260px" : "0px"} 1fr 300px`, minHeight: 0, transition: "grid-template-columns 280ms cubic-bezier(.2,.8,.2,1)" }}>
        {/* Left rail: tab icons (collapsed mode) */}
        <div style={{ borderRight: "1px solid var(--line)", background: "rgba(8,9,13,0.5)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 6 }}>
          {[
            { k: "scenes",    icon: <IconLibrary size={16}/>, label: "Scenes" },
            { k: "assets",    icon: <IconImage size={16}/>,   label: "Assets" },
            { k: "scripts",   icon: <IconType size={16}/>,    label: "Scripts" },
            { k: "music",     icon: <IconMusic size={16}/>,   label: "Music" },
            { k: "voiceover", icon: <IconMic size={16}/>,  label: "Voiceover" },
          ].map(t => (
            <button key={t.k}
              onClick={() => setLeftTab(leftTab === t.k ? null : t.k)}
              title={t.label}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: leftTab === t.k ? "rgba(122,162,255,0.10)" : "transparent",
                border: `1px solid ${leftTab === t.k ? "rgba(122,162,255,0.35)" : "transparent"}`,
                color: leftTab === t.k ? "#DCE4FF" : "var(--ink-3)",
                cursor: "pointer", display: "grid", placeItems: "center", transition: "all 200ms"
              }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Expandable left panel */}
        <aside style={{
          borderRight: leftTab ? "1px solid var(--line)" : "none",
          padding: leftTab ? "20px 16px" : 0,
          overflow: "hidden", background: "rgba(8,9,13,0.4)",
          opacity: leftTab ? 1 : 0, transition: "opacity 220ms"
        }}>
          {leftTab === "scenes" && (
            <>
              <PanelHeader title="SCENES" right={<button style={{ width:22, height:22, border: "1px solid var(--line)", background: "transparent", borderRadius: 6, color: "var(--ink-2)", cursor: "pointer", display:"grid", placeItems:"center" }}><IconPlus size={12}/></button>}/>
              {isEmpty ? (
                <div style={{ padding: "28px 14px", textAlign: "center", borderRadius: 12, border: "1px dashed var(--line-2)", background: "rgba(255,255,255,0.015)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(122,162,255,0.08)", border: "1px solid rgba(122,162,255,0.25)", display: "grid", placeItems: "center", margin: "0 auto 10px", color: "#7AA2FF" }}>
                    <IconLayers size={16}/>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-1)", fontWeight: 500 }}>No scenes yet</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45 }}>Add assets and a script — scenes are generated automatically.</div>
                </div>
              ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scenes.map((s, i) => (
                  <button key={i} onClick={()=>setSelected(i)} style={{
                    display: "flex", gap: 10, padding: 8, borderRadius: 10,
                    background: selected===i ? "rgba(122,162,255,0.06)" : "transparent",
                    border: `1px solid ${selected===i ? "rgba(122,162,255,0.30)" : "transparent"}`,
                    cursor: "pointer", textAlign: "left", transition: "all 200ms",
                    boxShadow: selected===i ? "0 8px 24px -8px rgba(122,162,255,0.3)" : "none"
                  }}>
                    <div style={{ width: 60, height: 38, borderRadius: 6, background: s.c, position: "relative", flexShrink: 0, overflow: "hidden" }}>
                      <div className="mf-mono" style={{ position: "absolute", top: 4, left: 5, fontSize: 8, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>0{i+1}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.t}</div>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.05em", marginTop: 2 }}>{s.d.toFixed(1)}s</div>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </>
          )}

          {leftTab === "assets" && (
            <>
              <PanelHeader title="ASSETS" right={<button style={{ width:22, height:22, border: "1px solid var(--line)", background: "transparent", borderRadius: 6, color: "var(--ink-2)", cursor: "pointer", display:"grid", placeItems:"center" }}><IconUpload size={11}/></button>}/>
              <div style={{
                marginBottom: 12, padding: isEmpty ? "22px 10px" : "14px 10px", borderRadius: 10,
                border: `1px dashed ${isEmpty ? "rgba(122,162,255,0.35)" : "var(--line-2)"}`,
                background: isEmpty ? "rgba(122,162,255,0.04)" : "rgba(255,255,255,0.015)",
                textAlign: "center"
              }}>
                {isEmpty && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(122,162,255,0.10)", border: "1px solid rgba(122,162,255,0.30)", display: "grid", placeItems: "center", margin: "0 auto 8px", color: "#7AA2FF" }}>
                    <IconUpload size={12}/>
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: 500 }}>Drop screenshots</div>
                <div className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 2 }}>PNG · JPG · MP4</div>
              </div>
              {isEmpty ? (
                <div style={{ marginTop: 8 }}>
                  <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}>OR PICK FROM</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { l: "Recent uploads",   c: 24 },
                      { l: "Brand assets",     c: 12 },
                      { l: "Templates",        c: 36 },
                    ].map((it, i) => (
                      <button key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: 8,
                        background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
                        color: "var(--ink-1)", fontSize: 12, cursor: "pointer", fontFamily: "inherit"
                      }}>
                        <span>{it.l}</span>
                        <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>{it.c}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {Array.from({ length: 8 }).map((_, i) => {
                  const hue = 220 + (i * 24) % 90;
                  return (
                    <div key={i} style={{
                      aspectRatio: "16/10", borderRadius: 8,
                      background: `linear-gradient(135deg, oklch(0.42 0.10 ${hue}), oklch(0.18 0.08 ${hue+30}))`,
                      border: "1px solid var(--line)", position: "relative", cursor: "grab", overflow: "hidden"
                    }}>
                      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15), transparent 55%)" }}/>
                      <div className="mf-mono" style={{ position: "absolute", left: 5, bottom: 4, fontSize: 8, color: "rgba(255,255,255,0.7)", letterSpacing: "0.06em" }}>0{i+1}</div>
                    </div>
                  );
                })}
              </div>
              )}
            </>
          )}

          {leftTab === "scripts" && (
            <>
              <PanelHeader title="SCRIPTS" right={<button style={{ width:22, height:22, border: "1px solid var(--line)", background: "transparent", borderRadius: 6, color: "var(--ink-2)", cursor: "pointer", display:"grid", placeItems:"center" }}><IconPlus size={12}/></button>}/>
              {isEmpty ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea
                    placeholder="Paste your script — release notes, a feature list, or a paragraph about your launch…"
                    style={{
                      width: "100%", minHeight: 220, resize: "vertical",
                      padding: "12px 14px", borderRadius: 10,
                      background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)",
                      color: "var(--ink-1)", fontSize: 12.5, lineHeight: 1.55,
                      fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { t: "Cold open", s: "Meet Lattice — the OS for high-performing teams." },
                  { t: "Hero feature", s: "Built for teams that ship." },
                  { t: "Workflow", s: "From goals to growth, every conversation lives here." },
                  { t: "CTA", s: "Start free. Ship faster." },
                ].map((sc, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", borderRadius: 10,
                    background: i===1 ? "rgba(122,162,255,0.06)" : "rgba(255,255,255,0.025)",
                    border: `1px solid ${i===1 ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
                    cursor: "pointer"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{sc.t}</span>
                      <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.06em" }}>0{i+1}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{sc.s}</div>
                  </div>
                ))}
                <button style={{
                  marginTop: 4, padding: "10px 12px", borderRadius: 10,
                  background: "transparent", border: "1px dashed var(--line-2)",
                  color: "var(--ink-2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}><IconPlus size={11}/> Add script</button>
              </div>
              )}
            </>
          )}

          {leftTab === "music" && (
            <>
              <PanelHeader title="MUSIC" right={<button style={{ width:22, height:22, border: "1px solid var(--line)", background: "transparent", borderRadius: 6, color: "var(--ink-2)", cursor: "pointer", display:"grid", placeItems:"center" }}><IconUpload size={11}/></button>}/>
              <div style={{
                marginBottom: 12, padding: isEmpty ? "22px 10px" : "14px 10px", borderRadius: 10,
                border: `1px dashed ${isEmpty ? "rgba(167,139,250,0.35)" : "var(--line-2)"}`,
                background: isEmpty ? "rgba(167,139,250,0.04)" : "rgba(255,255,255,0.015)",
                textAlign: "center"
              }}>
                {isEmpty && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.30)", display: "grid", placeItems: "center", margin: "0 auto 8px", color: "#A78BFA" }}>
                    <IconMusic size={12}/>
                  </div>
                )}
                <div style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: 500 }}>Drop a track</div>
                <div className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 2 }}>MP3 · WAV · M4A</div>
              </div>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginTop: 14, marginBottom: 8 }}>{isEmpty ? "OR PICK FROM LIBRARY" : "LIBRARY"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { t: "Cinematic — Aurora",    d: "2:14 · ambient · cinematic" },
                  { t: "Ascend — Pulse",        d: "1:48 · synth · launch" },
                  { t: "Soft Focus — Loop",     d: "1:30 · piano · minimal" },
                  { t: "Hyperdrive — Edit",     d: "0:54 · electronic · fast" },
                ].map((tr, i) => (
                  <button key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10, textAlign: "left",
                    background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
                    cursor: "pointer", fontFamily: "inherit"
                  }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)", display: "grid", placeItems: "center", color: "#A78BFA", flexShrink: 0, paddingLeft: 1 }}>
                      <IconPlay size={10}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tr.t}</div>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", marginTop: 2 }}>{tr.d}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {leftTab === "voiceover" && (
            <>
              <PanelHeader title="VOICEOVER" right={<button style={{ width:22, height:22, border: "1px solid var(--line)", background: "transparent", borderRadius: 6, color: "var(--ink-2)", cursor: "pointer", display:"grid", placeItems:"center" }}><IconPlus size={12}/></button>}/>
              <button style={{
                width: "100%", marginBottom: 12, padding: "16px 12px", borderRadius: 10,
                border: "1px dashed rgba(103,232,249,0.35)",
                background: "rgba(103,232,249,0.04)",
                color: "#67E8F9", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}><IconMic size={14}/> Record voiceover</button>
              <div style={{
                marginBottom: 14, padding: "12px 10px", borderRadius: 10,
                border: "1px dashed var(--line-2)", background: "rgba(255,255,255,0.015)",
                textAlign: "center"
              }}>
                <div style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: 500 }}>Or upload audio</div>
                <div className="mf-mono" style={{ fontSize: 9, color: "var(--ink-3)", letterSpacing: "0.08em", marginTop: 2 }}>MP3 · WAV · M4A</div>
              </div>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}>AI VOICES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { t: "Nova",     d: "Warm · cinematic" },
                  { t: "Atlas",    d: "Confident · narrator" },
                  { t: "Echo",     d: "Calm · documentary" },
                  { t: "Pulse",    d: "Energetic · launch" },
                ].map((v, i) => (
                  <button key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10, textAlign: "left",
                    background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
                    cursor: "pointer", fontFamily: "inherit"
                  }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(103,232,249,0.12)", border: "1px solid rgba(103,232,249,0.35)", display: "grid", placeItems: "center", color: "#67E8F9", flexShrink: 0 }}>
                      <IconMic size={11}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{v.t}</div>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", marginTop: 2 }}>{v.d}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* Center: preview only */}
        <section style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div className="mf-bg-bloom"/>
          {isEmpty ? (
            <EmptyPreview f={f} onAdd={()=>setIsEmpty(false)}/>
          ) : (
          <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 20, position: "relative", minHeight: 0, flex: 1 }}>
            <CinemaPreview aspect="16 / 9" frame={f} label={`SCENE 0${selected+1} · ${scenes[selected].t.toUpperCase()}`} style={{ flex: 1, minHeight: 0 }}>
              {/* Caption overlay */}
              <div style={{ position: "absolute", left: "50%", bottom: 64, transform: "translateX(-50%)", textAlign: "center", maxWidth: "70%" }}>
                <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
                  Built for teams that ship.
                </div>
              </div>
              {/* Selection brackets on focal area */}
              <div style={{ position: "absolute", inset: "20% 30%", border: "1px dashed rgba(122,162,255,0.4)", borderRadius: 6, pointerEvents: "none" }}>
                <Bracket pos="tl"/><Bracket pos="tr"/><Bracket pos="bl"/><Bracket pos="br"/>
              </div>
            </CinemaPreview>

            {/* Transport */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="mf-mono" style={{ fontSize: 12, letterSpacing: "0.06em", color: "var(--ink-1)" }}>
                {fmtTime(time)} <span style={{ color: "var(--ink-4)" }}>/ 01:00.00</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <TransportBtn><IconChevron size={16} style={{ transform: "rotate(90deg)" }}/></TransportBtn>
                <TransportBtn primary onClick={()=>setPlaying(!playing)}>{playing ? <IconPause size={14}/> : <IconPlay size={14}/>}</TransportBtn>
                <TransportBtn><IconChevron size={16} style={{ transform: "rotate(-90deg)" }}/></TransportBtn>
              </div>
              <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                4K · 24FPS
              </div>
            </div>
          </div>
          )}
          {/* (timeline moved to full-width row below) */}
        </section>

        {/* Right: motion presets / inspector */}
        <aside style={{ borderLeft: "1px solid var(--line)", padding: "20px 18px", overflow: "auto", background: "rgba(8,9,13,0.4)" }}>
          {isEmpty ? <EmptyInspector/> : (
          <>
          <div className="mf-eyebrow" style={{ marginBottom: 16 }}>INSPECTOR · SCENE 0{selected+1}</div>

          {/* Caption editor */}
          <div style={{ marginBottom: 22 }}>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 8 }}>CAPTION</div>
            <div style={{
              padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--line)", fontSize: 13, lineHeight: 1.5
            }}>
              Built for teams that ship.
            </div>
          </div>

          {/* Motion presets */}
          <div style={{ marginBottom: 22 }}>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 10 }}>MOTION PRESET</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {presets.map((p, i) => (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: i===0 ? "rgba(122,162,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${i===0 ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.t}</div>
                    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", marginTop: 2 }}>{p.d}</div>
                  </div>
                  {i===0 && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF", boxShadow: "0 0 8px #7AA2FF" }}/>}
                </div>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 10 }}>FINE TUNE</div>
          {[
            { l: "Intensity", v: 72 },
            { l: "Duration", v: 48 },
            { l: "Depth", v: 60 },
          ].map(s => (
            <div key={s.l} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-1)" }}>{s.l}</span>
                <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{s.v}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
                <div style={{ width: `${s.v}%`, height: "100%", background: "var(--grad-aurora)", borderRadius: 2 }}/>
                <div style={{
                  position: "absolute", top: -4, left: `calc(${s.v}% - 6px)`,
                  width: 12, height: 12, borderRadius: "50%", background: "white",
                  boxShadow: "0 0 0 1px rgba(122,162,255,0.5), 0 4px 12px rgba(0,0,0,0.4)"
                }}/>
              </div>
            </div>
          ))}
          </>)}
        </aside>
       </div>

       {/* Full-width timeline row */}
       <div style={{ borderTop: "1px solid var(--line)", background: "rgba(8,9,13,0.55)", padding: "16px 28px 18px" }}>
         {isEmpty ? <EmptyTimeline f={f}/> : (<>
         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
           <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
             <span className="mf-eyebrow">TIMELINE</span>
             <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>6 SCENES · 4 TRACKS</span>
           </div>
           <div style={{ display: "flex", gap: 6 }}>
             <Button variant="ghost" size="sm" icon={<IconScissors size={12}/>}>Split</Button>
             <Button variant="ghost" size="sm" icon={<IconWand size={12}/>}>Auto-fit</Button>
           </div>
         </div>

         {/* Ruler */}
         <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, marginBottom: 6 }}>
           <div/>
           <div style={{ position: "relative", height: 14 }}>
             {[0,10,20,30,40,50,60].map(t => (
               <div key={t} style={{ position: "absolute", left: `${(t/60)*100}%` }}>
                 <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.08em" }}>00:{String(t).padStart(2,"0")}</span>
               </div>
             ))}
           </div>
         </div>

         {/* Tracks */}
         <div style={{ display: "flex", flexDirection: "column", gap: 5, position: "relative" }}>
           {[
             { l: "VIDEO",  icon: <IconImage size={11}/>, blocks: scenes.map((s)=>({len: s.d, c: s.c, label: s.t})) },
             { l: "MOTION", icon: <IconWand size={11}/>,  blocks: [{len:14, c:"linear-gradient(90deg, #7AA2FF, transparent)"},{len:12, c:"linear-gradient(90deg, #A78BFA, transparent)"},{len:18, c:"linear-gradient(90deg, #67E8F9, transparent)"},{len:16, c:"linear-gradient(90deg, #7AA2FF, transparent)"}] },
             { l: "TEXT",   icon: <IconType size={11}/>,  blocks: [{len:8, c:"rgba(255,255,255,0.10)", label:"Cold open"},{len:14, c:"rgba(255,255,255,0.10)", label:"Built for teams"},{len:10, c:"rgba(255,255,255,0.10)", label:"CTA"}] },
             { l: "AUDIO",  icon: <IconMusic size={11}/>, blocks: [{len:60, c:"rgba(167,139,250,0.18)", wave: true}] },
           ].map((tr, ti) => (
             <div key={ti} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center" }}>
               <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)" }}>
                 {tr.icon}
                 <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.1em" }}>{tr.l}</span>
               </div>
               <div style={{ display: "flex", gap: 3, height: tr.l === "AUDIO" ? 30 : 28 }}>
                 {tr.blocks.map((b, bi) => (
                   <div key={bi} style={{
                     flex: b.len, borderRadius: 4,
                     background: b.c,
                     border: "1px solid rgba(255,255,255,0.08)",
                     padding: "0 10px",
                     display: "flex", alignItems: "center", overflow: "hidden",
                     position: "relative"
                   }}>
                     {b.label && <span className="mf-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{b.label.toUpperCase()}</span>}
                     {b.wave && (
                       <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 2, padding: "0 6px" }}>
                         {Array.from({length: 140}).map((_,i) => (
                           <div key={i} style={{ width: 2, height: `${20 + Math.abs(Math.sin((i+f/4)/3))*70}%`, background: "rgba(167,139,250,0.6)", borderRadius: 1 }}/>
                         ))}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             </div>
           ))}

           {/* Playhead */}
           <div style={{
             position: "absolute", top: -10, bottom: -2,
             left: `calc(72px + 10px + (100% - 72px - 10px) * ${time/60})`,
             width: 1, background: "#7AA2FF", boxShadow: "0 0 10px rgba(122,162,255,0.8)",
             pointerEvents: "none"
           }}>
             <div style={{ position: "absolute", top: -6, left: -4, width: 9, height: 9, borderRadius: "50%", background: "#7AA2FF", boxShadow: "0 0 12px rgba(122,162,255,0.9)" }}/>
           </div>
         </div>
         </>)}
       </div>
      </div>
    </AppChrome>
  );
};

const Bracket = ({ pos }) => {
  const corners = {
    tl: { top: -1, left: -1, borderLeft: "2px solid #7AA2FF", borderTop: "2px solid #7AA2FF" },
    tr: { top: -1, right: -1, borderRight: "2px solid #7AA2FF", borderTop: "2px solid #7AA2FF" },
    bl: { bottom: -1, left: -1, borderLeft: "2px solid #7AA2FF", borderBottom: "2px solid #7AA2FF" },
    br: { bottom: -1, right: -1, borderRight: "2px solid #7AA2FF", borderBottom: "2px solid #7AA2FF" },
  };
  return <div style={{ position: "absolute", width: 14, height: 14, ...corners[pos] }}/>;
};

const TransportBtn = ({ children, primary, onClick }) => (
  <button onClick={onClick} style={{
    width: primary ? 40 : 32, height: primary ? 40 : 32, borderRadius: "50%",
    background: primary ? "linear-gradient(180deg, #FFFFFF, #E6E8EE)" : "rgba(255,255,255,0.04)",
    border: primary ? "1px solid rgba(255,255,255,0.4)" : "1px solid var(--line)",
    color: primary ? "#06070A" : "var(--ink-1)", cursor: "pointer",
    display: "grid", placeItems: "center", boxShadow: primary ? "0 8px 24px -8px rgba(255,255,255,0.4)" : "none"
  }}>{children}</button>
);

const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`;
};

window.EditorScreen = EditorScreen;

/* ─── Empty State Components ─── */

const EmptyPreview = ({ f, onAdd }) => {
  const steps = [
    { n: "01", l: "Add screenshots", icon: <IconImage size={14}/>, done: false, hot: true },
    { n: "02", l: "Paste your script", icon: <IconType size={14}/>, done: false },
    { n: "03", l: "Generate motion",   icon: <IconWand size={14}/>, done: false },
  ];
  return (
    <div style={{ flex: 1, padding: "32px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative", minHeight: 0 }}>
      {/* Empty cinema preview */}
      <div style={{
        flex: 1, minHeight: 0, position: "relative", borderRadius: 16,
        border: "1px dashed rgba(122,162,255,0.30)",
        background: "linear-gradient(135deg, rgba(122,162,255,0.04), rgba(167,139,250,0.04))",
        overflow: "hidden", display: "grid", placeItems: "center"
      }}>
        {/* Ambient glow that follows mouse-y feel */}
        <div style={{ position: "absolute", left: "50%", top: "40%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(122,162,255,0.18), transparent 60%)", filter: "blur(40px)", transform: `translate(-50%, -50%) scale(${1 + Math.sin(f/60)*0.08})`, pointerEvents: "none" }}/>

        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.4,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 20%, transparent 70%)"
        }}/>

        {/* Center content */}
        <div style={{ position: "relative", textAlign: "center", maxWidth: 460, padding: "40px 32px", zIndex: 2 }}>
          {/* Animated icon stack */}
          <div style={{ position: "relative", width: 120, height: 88, margin: "0 auto 28px" }}>
            {[
              { rot: -8,  x: -36, c: "linear-gradient(135deg, #5468FF, #2D3340)", delay: 0 },
              { rot:  6,  x:   0, c: "linear-gradient(135deg, #7AA2FF, #A78BFA)", delay: 1 },
              { rot:  -4, x:  36, c: "linear-gradient(135deg, #A78BFA, #67E8F9)", delay: 2 },
            ].map((s, i) => (
              <div key={i} style={{
                position: "absolute", top: 0, left: "50%",
                width: 64, height: 80, borderRadius: 10,
                background: s.c, border: "1px solid rgba(255,255,255,0.18)",
                boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)",
                transform: `translateX(calc(-50% + ${s.x}px)) rotate(${s.rot + Math.sin((f + s.delay*30)/40)*3}deg) translateY(${Math.sin((f + s.delay*40)/50)*4}px)`,
                transition: "transform 240ms"
              }}>
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.25), transparent 60%)", borderRadius: 10 }}/>
              </div>
            ))}
            {/* Sparkle */}
            <div style={{
              position: "absolute", top: -8, right: 8, width: 22, height: 22, borderRadius: "50%",
              background: "var(--grad-aurora)", display: "grid", placeItems: "center", color: "white",
              boxShadow: "0 0 24px rgba(122,162,255,0.6)",
              transform: `scale(${1 + Math.sin(f/30)*0.1})`
            }}>
              <IconSparkle size={11} stroke={2.5}/>
            </div>
          </div>

          <div className="mf-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "#7AA2FF", marginBottom: 14 }}>NEW PROJECT</div>
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            Your <span className="mf-grad-text">cinematic story</span><br/>starts here.
          </h2>
          <p style={{ marginTop: 14, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
            Drop screenshots, paste your script, and Videly AI builds the scenes, pacing, and motion.
          </p>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 8 }}>
            <Button variant="primary" size="md" onClick={onAdd} icon={<IconUpload size={13}/>}>Upload assets</Button>
            <Button variant="ghost" size="md" icon={<IconWand size={13}/>}>Start from template</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmptyInspector = () => (
  <>
    <div className="mf-eyebrow" style={{ marginBottom: 16 }}>INSPECTOR</div>
    <div style={{
      padding: "20px 16px", borderRadius: 12,
      border: "1px dashed var(--line-2)", background: "rgba(255,255,255,0.015)",
      textAlign: "center", marginBottom: 18
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line-2)", display: "grid", placeItems: "center", margin: "0 auto 10px", color: "var(--ink-3)" }}>
        <IconLayers size={14}/>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-1)", fontWeight: 500 }}>Nothing selected</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.45 }}>Generate scenes to fine-tune motion, captions, and pacing here.</div>
    </div>

    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 12 }}>SUGGESTED PRESETS</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[
        { t: "Linear",     d: "Minimal · technical",  c: "#7AA2FF" },
        { t: "Apple",      d: "Cinematic · elegant",  c: "#FAFAFC" },
        { t: "Hyper",      d: "Fast · launch-first",  c: "#F472B6" },
        { t: "Glass",      d: "Soft · layered depth", c: "#67E8F9" },
      ].map((p, i) => (
        <div key={i} style={{
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(255,255,255,0.025)", border: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer"
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.c, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.t}</div>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em", marginTop: 2 }}>{p.d}</div>
          </div>
        </div>
      ))}
    </div>

    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginTop: 22, marginBottom: 10 }}>ASPECT RATIO</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
      {[
        { l: "16:9", a: "16/9",  active: true },
        { l: "9:16", a: "9/16" },
        { l: "1:1",  a: "1/1" },
      ].map((r, i) => (
        <div key={i} style={{
          padding: "10px 8px", borderRadius: 8,
          background: r.active ? "rgba(122,162,255,0.06)" : "rgba(255,255,255,0.025)",
          border: `1px solid ${r.active ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer"
        }}>
          <div style={{ width: 28, aspectRatio: r.a, borderRadius: 3, background: r.active ? "var(--grad-aurora)" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}/>
          <span className="mf-mono" style={{ fontSize: 10, color: r.active ? "#DCE4FF" : "var(--ink-2)", letterSpacing: "0.06em" }}>{r.l}</span>
        </div>
      ))}
    </div>
  </>
);

const EmptyTimeline = ({ f }) => (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <span className="mf-eyebrow">TIMELINE</span>
        <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>0 SCENES · WAITING FOR ASSETS</span>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>00:00.00 / 00:00.00</span>
      </div>
    </div>

    {/* Empty ruler */}
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, marginBottom: 6 }}>
      <div/>
      <div style={{ position: "relative", height: 14 }}>
        {[0,10,20,30,40,50,60].map(t => (
          <div key={t} style={{ position: "absolute", left: `${(t/60)*100}%` }}>
            <span className="mf-mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.08em" }}>00:{String(t).padStart(2,"0")}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Empty tracks */}
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {[
        { l: "VIDEO",  icon: <IconImage size={11}/>, hint: "Drop screenshots into Assets to populate" },
        { l: "MOTION", icon: <IconWand size={11}/>,  hint: "Generated when scenes exist" },
        { l: "TEXT",   icon: <IconType size={11}/>,  hint: "Captions appear here from your script" },
        { l: "AUDIO",  icon: <IconMusic size={11}/>, hint: "Optional voiceover or soundtrack" },
      ].map((tr, ti) => (
        <div key={ti} style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)" }}>
            {tr.icon}
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.1em" }}>{tr.l}</span>
          </div>
          <div style={{
            height: 28, borderRadius: 4,
            border: "1px dashed var(--line)",
            background: `linear-gradient(90deg, rgba(122,162,255,${0.02 + Math.abs(Math.sin((f+ti*30)/60))*0.04}), transparent 50%)`,
            display: "flex", alignItems: "center", paddingLeft: 12,
            position: "relative", overflow: "hidden"
          }}>
            <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.05em" }}>{tr.hint}</span>
          </div>
        </div>
      ))}
    </div>
  </>
);


const PanelHeader = ({ title, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <div className="mf-eyebrow">{title}</div>
    {right}
  </div>
);

const GenerateButton = ({ onClick, label = "Generate" }) => {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "0 16px", height: 32, borderRadius: 8,
        border: "1px solid rgba(167,139,250,0.45)",
        background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
        backgroundSize: "200% 100%",
        backgroundPosition: hover ? "100% 0" : "0% 0",
        transition: "background-position 600ms ease, transform 200ms, box-shadow 200ms",
        transform: hover ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hover
          ? "0 8px 28px rgba(122,162,255,0.45), 0 0 0 1px rgba(167,139,250,0.5), inset 0 1px 0 rgba(255,255,255,0.25)"
          : "0 4px 14px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
        color: "#0B0C10", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.005em",
        fontFamily: "inherit", cursor: "pointer",
        overflow: "hidden",
      }}>
      <span style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(120px 40px at 30% 0%, rgba(255,255,255,0.4), transparent 70%)",
        opacity: hover ? 1 : 0.55, transition: "opacity 300ms",
      }}/>
      <IconWand size={13}/>
      <span style={{ position: "relative" }}>{label}</span>
      <span className="mf-mono" style={{
        position: "relative",
        fontSize: 9.5, letterSpacing: "0.06em",
        padding: "2px 5px", borderRadius: 4,
        background: "rgba(11,12,16,0.18)",
        border: "1px solid rgba(11,12,16,0.20)",
        color: "rgba(11,12,16,0.75)",
      }}>⌘ ⏎</span>
    </button>
  );
};

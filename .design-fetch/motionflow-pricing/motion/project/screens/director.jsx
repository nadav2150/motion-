/* Director Studio — AI Film Direction System
 * Pipeline: Script → Director Brain (LLM) → Storyboard → Image gen → Video gen → Stitch
 */
const DirectorScreen = ({ onNav, onContinue, stage: initialStage = "directing" }) => {
  const f = useFrame();
  const [stage, setStage] = useState(initialStage); // directing | storyboard | imaging | video | stitching | done
  const [selected, setSelected] = useState(2);
  const [activeTab, setActiveTab] = useState("shots"); // script | brand | shots | music | voice
  const [view, setView] = useState("storyboard"); // storyboard | shot

  // 9-shot storyboard derived from an example script
  const shots = [
    { id:"S01", dur:2.0, goal:"Cold open — atmospheric tease",
      composition:"Centered hero · negative space top",
      camera:"Slow push-in",       lighting:"Cinematic rim · cool",
      uiDensity:"none",            transitionOut:"Hard cut",
      palette:["#0A0B10","#5468FF","#7AA2FF"],
      overlay:"",                  status:{board:"done", image:"done", video:"done", stitch:"done"},
      kind:"atmosphere",
      imgPrompt:"Cinematic dark studio, soft cool rim light, dust particles, ultra-shallow depth, anamorphic flares, sense of anticipation",
      vidPrompt:"Slow 1.4x push-in, particles drift right→left, subtle volumetric haze, 24fps",
      negative:"text, logos, lifestyle photography, stock imagery, full-screen photo",
    },
    { id:"S02", dur:2.6, goal:"Brand reveal",
      composition:"Logo at optical centre · top-light bloom",
      camera:"Static · gentle parallax",
      lighting:"Aurora bloom from above",
      uiDensity:"none", transitionOut:"Crossfade",
      palette:["#06070A","#A78BFA","#7AA2FF"],
      overlay:"LATTICE",            status:{board:"done", image:"done", video:"done", stitch:"running"},
      kind:"reveal",
      imgPrompt:"Premium monogram glyph centered, aurora bloom above, layered glass cards faintly behind, jet black backdrop, cinematic poster composition",
      vidPrompt:"Bloom intensifies, glyph 2% scale-up, atmospheric haze breathing",
      negative:"stock, photography, lifestyle, kitsch",
    },
    { id:"S03", dur:3.4, goal:"Hero product — dashboard window",
      composition:"Off-axis dashboard · diagonal framing",
      camera:"Lateral pan-right + slight tilt",
      lighting:"Soft top-left key · cyan accent",
      uiDensity:"high", transitionOut:"Match cut",
      palette:["#06070A","#7AA2FF","#67E8F9"],
      overlay:"Built for teams that ship.",
      status:{board:"done", image:"done", video:"running", stitch:"queued"},
      kind:"ui-hero",
      imgPrompt:"Floating macOS-style window angled 12° showing real analytics dashboard with sidebar, charts, KPI cards, soft top-left key light, atmospheric depth haze behind, dark stage. Premium SaaS launch render quality.",
      vidPrompt:"Lateral pan-right 0.6s, micro-tilt 1.5°, faint chart line ticking, breathing rim-light",
      negative:"empty UI, placeholder boxes, generic icons, floating widgets, cluttered text",
    },
    { id:"S04", dur:2.4, goal:"Feature 01 — timeline editor",
      composition:"Macro close-up · timeline tracks fill frame",
      camera:"Slow lateral dolly",
      lighting:"Underglow + soft fill",
      uiDensity:"medium", transitionOut:"Whip pan",
      palette:["#06070A","#A78BFA","#7AA2FF"],
      overlay:"Direct on the timeline.",
      status:{board:"done", image:"done", video:"queued", stitch:"queued"},
      kind:"ui-macro",
      imgPrompt:"Ultra-macro shot of a timeline editor UI with multi-track ribbons, playhead, waveform, scene thumbnails. Edge falloff to black. Cinematic shallow DOF.",
      vidPrompt:"Lateral dolly 0.4 units, playhead ticks two frames forward, gentle parallax",
      negative:"full ui, sidebar visible, browser chrome",
    },
    { id:"S05", dur:2.2, goal:"Feature 02 — caption editor",
      composition:"Asymmetric · UI hugs right edge",
      camera:"Static · subtle breathing",
      lighting:"Soft key from camera-right",
      uiDensity:"medium", transitionOut:"Crossfade",
      palette:["#06070A","#7AA2FF","#A6F0BD"],
      overlay:"Captions, automatically.",
      status:{board:"done", image:"running", video:"queued", stitch:"queued"},
      kind:"ui-detail",
      imgPrompt:"Caption editor UI panel hugging right third of frame, type-set headline + waveform, large negative space on left with aurora atmosphere. Cinematic depth.",
      vidPrompt:"Subtle 0.5% scale breath, waveform amplitude micro-moves, atmospheric drift",
      negative:"centered layout, tight composition, multiple windows",
    },
    { id:"S06", dur:2.8, goal:"Workflow montage",
      composition:"Layered UI stack · depth focus",
      camera:"Push-in through layers",
      lighting:"Volumetric beams from above",
      uiDensity:"high", transitionOut:"Speed ramp",
      palette:["#06070A","#5468FF","#A78BFA"],
      overlay:"From idea to launch in minutes.",
      status:{board:"done", image:"queued", video:"queued", stitch:"queued"},
      kind:"ui-stack",
      imgPrompt:"Three layered glass UI cards in z-depth — script, storyboard, timeline — receding into haze, volumetric god-rays from top, cinematic 50mm composition",
      vidPrompt:"Camera dollies forward 0.8 units, layers parallax at different rates, beams shimmer",
      negative:"flat layout, single card, photography",
    },
    { id:"S07", dur:2.6, goal:"Result preview — finished film frame",
      composition:"Cinematic 2.39:1 letterbox",
      camera:"Static hold",
      lighting:"Filmic warm rim · low key",
      uiDensity:"none", transitionOut:"Hard cut",
      palette:["#06070A","#F0D08A","#C77B5C"],
      overlay:"",
      status:{board:"done", image:"queued", video:"queued", stitch:"queued"},
      kind:"film",
      imgPrompt:"Cinematic anamorphic 2.39:1 frame of a moody product film — warm rim-lit subject silhouetted, premium ad photography quality, lens distortion, grain",
      vidPrompt:"4 frames of micro-motion, lens bloom shimmer",
      negative:"ui, dashboard, screen",
    },
    { id:"S08", dur:2.4, goal:"Social proof — creator frame",
      composition:"Vertical creator card · left-aligned",
      camera:"Micro-zoom",
      lighting:"Soft window-style key",
      uiDensity:"low", transitionOut:"Crossfade",
      palette:["#06070A","#7AA2FF","#F472B6"],
      overlay:"Loved by 4,200+ teams.",
      status:{board:"done", image:"queued", video:"queued", stitch:"queued"},
      kind:"social",
      imgPrompt:"Floating creator profile card with avatar, quote, and product micro-thumbnail. Left third of frame. Negative space right. Premium SaaS launch render.",
      vidPrompt:"Card 0.3% scale breath, micro avatar shimmer",
      negative:"full-screen face photo, lifestyle photography",
    },
    { id:"S09", dur:1.8, goal:"CTA — final hold",
      composition:"Centered wordmark · vignette",
      camera:"Static",
      lighting:"Aurora bloom · centered",
      uiDensity:"none", transitionOut:"Fade to black",
      palette:["#06070A","#7AA2FF","#A78BFA"],
      overlay:"Start free.",
      status:{board:"done", image:"queued", video:"queued", stitch:"queued"},
      kind:"cta",
      imgPrompt:"Centered wordmark on jet black stage, aurora bloom behind, soft vignette, cinematic poster",
      vidPrompt:"Subtle aurora pulse, vignette breath",
      negative:"ui, photography",
    },
  ];
  const shot = shots[selected];

  return (
    <AppChrome
      active="director"
      onNav={onNav}
      project="Lattice — Q4 launch film"
      right={
        <>
          <Pill icon={<span style={{width:6,height:6,borderRadius:"50%",background:"#7AA2FF"}}/>}>
            <span className="mf-mono" style={{fontSize:10, letterSpacing:"0.08em"}}>{(shots.reduce((a,s)=>a+s.dur,0)).toFixed(1)}s · {shots.length} SHOTS</span>
          </Pill>
          <Button variant="ghost" size="sm" icon={<IconShare size={12}/>}>Share board</Button>
          <GenerateButton onClick={()=>setStage("imaging")} label="Run pipeline"/>
          <Button variant="ghost" size="sm" onClick={onContinue} iconRight={<IconArrowRight size={12}/>}>Export</Button>
        </>
      }>

      {/* Pipeline status strip */}
      <PipelineStrip stage={stage} f={f}/>

      <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "calc(100% - 56px)" }}>
       <div style={{ display: "grid", gridTemplateColumns: `48px 280px 1fr 340px`, minHeight: 0 }}>
        {/* Left rail */}
        <div style={{ borderRight: "1px solid var(--line)", background: "rgba(8,9,13,0.5)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 6 }}>
          {[
            { k: "script", icon: <IconType size={16}/>,   label: "Script" },
            { k: "brand",  icon: <IconPalette size={16}/>,label: "Brand" },
            { k: "shots",  icon: <IconLibrary size={16}/>,label: "Shots" },
            { k: "music",  icon: <IconMusic size={16}/>,  label: "Music" },
            { k: "voice",  icon: <IconMic size={16}/>,    label: "Voiceover" },
          ].map(t => (
            <button key={t.k} onClick={()=>setActiveTab(t.k)} title={t.label}
              style={{ width: 32, height: 32, borderRadius: 8,
                background: activeTab===t.k ? "rgba(122,162,255,0.10)" : "transparent",
                border: `1px solid ${activeTab===t.k ? "rgba(122,162,255,0.35)" : "transparent"}`,
                color: activeTab===t.k ? "#DCE4FF" : "var(--ink-3)",
                cursor: "pointer", display: "grid", placeItems: "center", transition: "all 200ms" }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Left panel */}
        <aside style={{ borderRight: "1px solid var(--line)", padding: "18px 16px", overflow: "auto", background: "rgba(8,9,13,0.4)" }}>
          {activeTab === "script" && <ScriptPanel/>}
          {activeTab === "brand"  && <BrandPanel/>}
          {activeTab === "shots"  && <ShotListPanel shots={shots} selected={selected} onSelect={setSelected}/>}
          {activeTab === "music"  && <MusicPanel/>}
          {activeTab === "voice"  && <VoicePanel/>}
        </aside>

        {/* Center */}
        <section style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <div className="mf-bg-bloom"/>
          <div style={{ padding: "16px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                {k:"storyboard", l:"Storyboard", icon:<IconLibrary size={12}/>},
                {k:"shot",       l:"Shot detail", icon:<IconCamera size={12}/>},
              ].map(v => (
                <button key={v.k} onClick={()=>setView(v.k)} style={{
                  padding: "10px 14px", fontSize: 12.5, fontWeight: 500,
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                  color: view===v.k ? "var(--ink-0)" : "var(--ink-3)",
                  borderBottom: `2px solid ${view===v.k ? "#7AA2FF" : "transparent"}`,
                  display: "inline-flex", alignItems: "center", gap: 6, marginBottom: -1
                }}>{v.icon}{v.l}</button>
              ))}
            </div>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em" }}>
              DIRECTOR · GPT-5 · PACING: CINEMATIC · TONE: PREMIUM
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "22px 28px" }}>
            {view === "storyboard"
              ? <StoryboardGrid shots={shots} selected={selected} onSelect={(i)=>{setSelected(i); setView("shot");}} f={f}/>
              : <ShotDetail shot={shot} f={f}/>}
          </div>
        </section>

        {/* Right inspector — shot direction */}
        <aside style={{ borderLeft: "1px solid var(--line)", padding: "18px 18px", overflow: "auto", background: "rgba(8,9,13,0.4)" }}>
          <ShotInspector shot={shot}/>
        </aside>
       </div>

       {/* Bottom: per-shot pipeline timeline */}
       <PipelineTimeline shots={shots} selected={selected} onSelect={setSelected} f={f}/>
      </div>
    </AppChrome>
  );
};

/* ─────── Pipeline ─────── */

const PIPELINE_STAGES = [
  { k:"directing",  l:"Director brain", sub:"LLM splits script into beats" },
  { k:"storyboard", l:"Storyboard",     sub:"Frame composition + prompts" },
  { k:"imaging",    l:"Image gen",      sub:"Flux · Imagen · Nano Banana" },
  { k:"video",      l:"Video gen",      sub:"Seedance · Kling · Runway" },
  { k:"stitching",  l:"Stitch",         sub:"ffmpeg · audio sync" },
];

const PipelineStrip = ({ stage, f }) => {
  const idx = PIPELINE_STAGES.findIndex(s => s.k === stage);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, padding:"10px 24px", borderBottom:"1px solid var(--line)", background:"rgba(8,9,13,0.6)" }}>
      {PIPELINE_STAGES.map((s, i) => {
        const status = i < idx ? "done" : i === idx ? "running" : "queued";
        const c = status === "done" ? "#A6F0BD" : status === "running" ? "#7AA2FF" : "var(--ink-4)";
        return (
          <React.Fragment key={s.k}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 10px" }}>
              <div style={{ position:"relative", width:22, height:22, borderRadius:"50%",
                background:`rgba(${status==="done"?"166,240,189":status==="running"?"122,162,255":"255,255,255"}, 0.10)`,
                border:`1px solid ${c}`,
                display:"grid", placeItems:"center", color:c, fontSize:10 }}>
                {status==="done" ? <IconCheck size={11}/> : status==="running"
                  ? <span style={{width:6,height:6,borderRadius:"50%",background:c, boxShadow:`0 0 8px ${c}`, animation:"mfPulse 1.2s ease-in-out infinite"}}/>
                  : <span className="mf-mono" style={{fontSize:9}}>{String(i+1).padStart(2,"0")}</span>}
              </div>
              <div>
                <div style={{ fontSize:12.5, fontWeight:500, color: status==="queued" ? "var(--ink-3)" : "var(--ink-0)" }}>{s.l}</div>
                <div className="mf-mono" style={{ fontSize:9.5, letterSpacing:"0.06em", color:"var(--ink-3)" }}>{s.sub}</div>
              </div>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div style={{ flex:1, height:1, background: i < idx ? "#A6F0BD" : "var(--line-2)", opacity: i < idx ? 0.5 : 1, position:"relative", overflow:"hidden" }}>
                {i === idx && (
                  <div style={{ position:"absolute", inset:0, background:`linear-gradient(90deg, transparent, #7AA2FF 50%, transparent)`, transform:`translateX(${(f*2)%200 - 100}%)`, opacity:0.8 }}/>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ─────── Left panels ─────── */

const ScriptPanel = () => (
  <>
    <PanelHeader title="SCRIPT"/>
    <textarea
      defaultValue={`Meet Lattice — the OS for high-performing teams.\n\nFrom goals to growth, every conversation lives here.\n\nBuilt for teams that ship.\n\nStart free.`}
      style={{ width:"100%", minHeight: 220, resize:"vertical", padding:"12px 14px",
        borderRadius: 10, background:"rgba(0,0,0,0.25)", border:"1px solid var(--line)",
        color:"var(--ink-1)", fontSize:12.5, lineHeight:1.55, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
    <div style={{ marginTop:14 }} className="mf-mono">
      <div style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.12em", marginBottom:8 }}>DIRECTION HINTS</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {["Cinematic","Premium","Restrained","Confident","Atmospheric"].map((t,i) => (
          <span key={i} style={{ padding:"5px 10px", borderRadius:999,
            background: i===0 ? "rgba(122,162,255,0.10)" : "rgba(255,255,255,0.04)",
            border:`1px solid ${i===0 ? "rgba(122,162,255,0.35)" : "var(--line)"}`,
            fontSize:11, color: i===0 ? "#DCE4FF" : "var(--ink-2)", cursor:"pointer" }}>{t}</span>
        ))}
      </div>
    </div>
  </>
);

const BrandPanel = () => (
  <>
    <PanelHeader title="BRAND KIT"/>
    <Field label="WORDMARK"><div style={{ padding:"14px 12px", borderRadius:10, background:"rgba(0,0,0,0.25)", border:"1px solid var(--line)", fontFamily:'"Geist", system-ui', fontWeight:600, letterSpacing:"-0.02em", fontSize:18 }}>LATTICE</div></Field>
    <Field label="PALETTE">
      <div style={{ display:"flex", gap:6 }}>
        {["#06070A","#7AA2FF","#A78BFA","#67E8F9","#F472B6"].map((c,i)=>(
          <div key={i} style={{ flex:1, aspectRatio:"1/1", borderRadius:8, background:c, border:"1px solid rgba(255,255,255,0.08)" }}/>
        ))}
      </div>
    </Field>
    <Field label="TYPOGRAPHY">
      <div style={{ padding:"10px 12px", borderRadius:10, background:"rgba(0,0,0,0.25)", border:"1px solid var(--line)" }}>
        <div style={{ fontSize:11, color:"var(--ink-3)" }} className="mf-mono">DISPLAY</div>
        <div style={{ fontFamily:'"Geist", system-ui', fontWeight:600, fontSize:22, letterSpacing:"-0.025em" }}>Geist · 96–160px</div>
        <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:8 }} className="mf-mono">BODY</div>
        <div style={{ fontFamily:'"Geist", system-ui', fontSize:14, color:"var(--ink-2)" }}>Geist · 28–48px</div>
      </div>
    </Field>
    <Field label="VISUAL TONE">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        {[{l:"Cinematic", a:true},{l:"Editorial"},{l:"Hyper-edit"},{l:"Minimal"}].map((t,i)=>(
          <button key={i} style={{ padding:"10px 8px", borderRadius:8, fontFamily:"inherit",
            background: t.a ? "rgba(122,162,255,0.08)" : "rgba(255,255,255,0.02)",
            border:`1px solid ${t.a ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
            color: t.a ? "#DCE4FF" : "var(--ink-2)", fontSize:11.5, cursor:"pointer" }}>{t.l}</button>
        ))}
      </div>
    </Field>
  </>
);

const ShotListPanel = ({ shots, selected, onSelect }) => (
  <>
    <PanelHeader title={`SHOTS · ${shots.length}`} right={<button style={{ width:22, height:22, border:"1px solid var(--line)", background:"transparent", borderRadius:6, color:"var(--ink-2)", cursor:"pointer", display:"grid", placeItems:"center" }}><IconPlus size={12}/></button>}/>
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {shots.map((s, i) => (
        <button key={s.id} onClick={()=>onSelect(i)} style={{
          display:"flex", gap:10, padding:8, borderRadius:10, textAlign:"left",
          background: selected===i ? "rgba(122,162,255,0.06)" : "transparent",
          border:`1px solid ${selected===i ? "rgba(122,162,255,0.30)" : "transparent"}`,
          cursor:"pointer", fontFamily:"inherit" }}>
          <ShotThumb shot={s} w={60} h={38}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span className="mf-mono" style={{ fontSize:9.5, letterSpacing:"0.08em", color:"var(--ink-3)" }}>{s.id}</span>
              <span className="mf-mono" style={{ fontSize:9.5, letterSpacing:"0.06em", color:"var(--ink-3)" }}>{s.dur.toFixed(1)}s</span>
            </div>
            <div style={{ fontSize:12, fontWeight:500, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.goal}</div>
          </div>
        </button>
      ))}
    </div>
  </>
);

const MusicPanel = () => (
  <>
    <PanelHeader title="MUSIC"/>
    <div style={{ padding:"22px 10px", borderRadius:10, border:"1px dashed rgba(167,139,250,0.35)", background:"rgba(167,139,250,0.04)", textAlign:"center", marginBottom:14 }}>
      <div style={{ width:28, height:28, borderRadius:8, background:"rgba(167,139,250,0.10)", border:"1px solid rgba(167,139,250,0.30)", display:"grid", placeItems:"center", margin:"0 auto 8px", color:"#A78BFA" }}><IconMusic size={12}/></div>
      <div style={{ fontSize:12, fontWeight:500 }}>Drop a track</div>
      <div className="mf-mono" style={{ fontSize:9, color:"var(--ink-3)", letterSpacing:"0.08em", marginTop:2 }}>MP3 · WAV · M4A</div>
    </div>
    <div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.12em", marginBottom:8 }}>SUGGESTED FOR CINEMATIC</div>
    {[{t:"Aurora — Ambient", d:"2:14 · cinematic"},{t:"Ascend — Pulse", d:"1:48 · launch"},{t:"Soft Focus", d:"1:30 · minimal"}].map((tr,i)=>(
      <button key={i} style={{ width:"100%", display:"flex", gap:10, padding:"10px 12px", borderRadius:10, background:"rgba(255,255,255,0.025)", border:"1px solid var(--line)", marginBottom:6, fontFamily:"inherit", textAlign:"left", cursor:"pointer", alignItems:"center" }}>
        <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(167,139,250,0.12)", border:"1px solid rgba(167,139,250,0.35)", display:"grid", placeItems:"center", color:"#A78BFA" }}><IconPlay size={10}/></div>
        <div><div style={{ fontSize:12.5, fontWeight:500 }}>{tr.t}</div><div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)" }}>{tr.d}</div></div>
      </button>
    ))}
  </>
);

const VoicePanel = () => (
  <>
    <PanelHeader title="VOICEOVER"/>
    <button style={{ width:"100%", padding:"14px 12px", borderRadius:10, border:"1px dashed rgba(103,232,249,0.35)", background:"rgba(103,232,249,0.04)", color:"#67E8F9", fontSize:12.5, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit", marginBottom:12 }}>
      <IconMic size={14}/> Record voiceover
    </button>
    <div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.12em", marginBottom:8 }}>AI VOICES</div>
    {[{t:"Nova",d:"Warm · cinematic", a:true},{t:"Atlas",d:"Confident narrator"},{t:"Echo",d:"Calm · documentary"}].map((v,i)=>(
      <button key={i} style={{ width:"100%", display:"flex", gap:10, padding:"10px 12px", borderRadius:10, background: v.a ? "rgba(103,232,249,0.06)" : "rgba(255,255,255,0.025)", border:`1px solid ${v.a ? "rgba(103,232,249,0.30)" : "var(--line)"}`, marginBottom:6, fontFamily:"inherit", textAlign:"left", cursor:"pointer", alignItems:"center" }}>
        <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(103,232,249,0.12)", border:"1px solid rgba(103,232,249,0.35)", display:"grid", placeItems:"center", color:"#67E8F9" }}><IconMic size={11}/></div>
        <div><div style={{ fontSize:12.5, fontWeight:500 }}>{v.t}</div><div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)" }}>{v.d}</div></div>
      </button>
    ))}
  </>
);

/* ─────── Storyboard grid ─────── */

const StoryboardGrid = ({ shots, selected, onSelect, f }) => (
  <div>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14 }}>
      <div>
        <div className="mf-mono" style={{ fontSize:10, letterSpacing:"0.14em", color:"#7AA2FF" }}>DIRECTOR'S STORYBOARD</div>
        <div style={{ fontSize:24, fontWeight:500, letterSpacing:"-0.02em", marginTop:4 }}>{shots.length} shots · {shots.reduce((a,s)=>a+s.dur,0).toFixed(1)}s · cinematic pacing</div>
      </div>
      <div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.1em" }}>EDITED BY DIRECTOR BRAIN · 2.1s AGO</div>
    </div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:14 }}>
      {shots.map((s, i) => (
        <button key={s.id} onClick={()=>onSelect(i)} style={{
          textAlign:"left", padding:0, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit",
        }}>
          <div style={{
            border:`1px solid ${selected===i ? "rgba(122,162,255,0.45)" : "var(--line)"}`,
            borderRadius:14, overflow:"hidden",
            background:"rgba(8,9,13,0.55)",
            boxShadow: selected===i ? "0 18px 40px -16px rgba(122,162,255,0.35)" : "0 1px 0 rgba(255,255,255,0.03)",
            transition:"all 240ms"
          }}>
            <ShotThumb shot={s} h={148} f={f}/>
            <div style={{ padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span className="mf-mono" style={{ fontSize:10, color:"#7AA2FF", letterSpacing:"0.1em" }}>{s.id} · {s.dur.toFixed(1)}s</span>
                <ShotStatusDot status={s.status}/>
              </div>
              <div style={{ fontSize:13.5, fontWeight:500, letterSpacing:"-0.005em", marginBottom:8 }}>{s.goal}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                <Tag>{s.camera}</Tag><Tag>{s.lighting}</Tag>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>
);

/* ─────── Shot detail ─────── */

const ShotDetail = ({ shot, f }) => (
  <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:18, alignItems:"start" }}>
    <div>
      <CinemaPreview aspect="16/9" frame={f} label={`${shot.id} · ${shot.goal.toUpperCase()}`} style={{ minHeight: 380 }}>
        <ShotComposition shot={shot} f={f}/>
        {shot.overlay && (
          <div style={{ position:"absolute", left:"50%", bottom:48, transform:"translateX(-50%)", textAlign:"center", maxWidth:"75%" }}>
            <div style={{ fontFamily:'"Geist", system-ui', fontWeight:500, fontSize:34, letterSpacing:"-0.025em", lineHeight:1.05, textShadow:"0 4px 30px rgba(0,0,0,0.7)" }}>{shot.overlay}</div>
          </div>
        )}
        <div style={{ position:"absolute", inset:"18% 28%", border:"1px dashed rgba(122,162,255,0.35)", borderRadius:6 }}>
          {["tl","tr","bl","br"].map(p => <DirBracket key={p} pos={p}/>)}
        </div>
      </CinemaPreview>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:14 }}>
        <Tag>{shot.composition}</Tag>
        <Tag>{shot.transitionOut} →</Tag>
      </div>
    </div>
    <div>
      <Field label="SHOT GOAL"><div style={{ fontSize:14, lineHeight:1.5 }}>{shot.goal}</div></Field>
      <Field label="IMAGE PROMPT" mono>
        <PromptBox text={shot.imgPrompt} model="Flux 1.1 Pro" color="#7AA2FF" icon={<IconImage size={11}/>}/>
      </Field>
      <Field label="VIDEO PROMPT" mono>
        <PromptBox text={shot.vidPrompt} model="Seedance · img2vid" color="#A78BFA" icon={<IconPlay size={10}/>}/>
      </Field>
      <Field label="NEGATIVE" mono>
        <div style={{ padding:"10px 12px", borderRadius:10, background:"rgba(0,0,0,0.25)", border:"1px solid rgba(244,114,182,0.20)", fontSize:11.5, lineHeight:1.45, color:"#FCA5C5", fontFamily:'"Geist Mono", ui-monospace, monospace' }}>{shot.negative}</div>
      </Field>
    </div>
  </div>
);

const PromptBox = ({ text, model, color, icon }) => (
  <div style={{ padding:"12px 12px", borderRadius:10, background:"rgba(0,0,0,0.25)", border:"1px solid var(--line)" }}>
    <div style={{ fontSize:11.5, lineHeight:1.5, color:"var(--ink-1)", fontFamily:'"Geist Mono", ui-monospace, monospace' }}>{text}</div>
    <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"3px 8px", borderRadius:999, background:`${color}1A`, border:`1px solid ${color}55`, color, fontSize:10.5 }} className="mf-mono">{icon}{model}</span>
      <button style={{ padding:"3px 8px", borderRadius:6, background:"transparent", border:"1px solid var(--line)", color:"var(--ink-2)", fontSize:10.5, cursor:"pointer", fontFamily:"inherit" }} className="mf-mono">REGENERATE</button>
    </div>
  </div>
);

/* ─────── Right inspector ─────── */

const ShotInspector = ({ shot }) => (
  <>
    <div className="mf-eyebrow" style={{ marginBottom:14 }}>DIRECTION · {shot.id}</div>
    <Field label="COMPOSITION"><Chips options={["Centered hero","Asymmetric · right","Diagonal","Macro close-up","Layered UI stack","Letterbox 2.39:1"]} active={shot.composition.split(" ·")[0]}/></Field>
    <Field label="CAMERA MOTION"><Chips options={["Static","Slow push-in","Lateral pan","Dolly through","Whip pan","Micro-zoom"]} active={shot.camera.split(" ·")[0]}/></Field>
    <Field label="LIGHTING"><Chips options={["Cinematic rim","Aurora bloom","Volumetric beams","Soft top-left","Filmic warm","Underglow"]} active={shot.lighting.split(" ·")[0].split("·")[0].trim()}/></Field>
    <Field label="UI DENSITY">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:4 }}>
        {["none","low","medium","high"].map((d,i)=>(
          <button key={i} style={{ padding:"7px 6px", borderRadius:6, fontFamily:"inherit", fontSize:11,
            background: shot.uiDensity===d ? "rgba(122,162,255,0.10)" : "rgba(255,255,255,0.025)",
            border:`1px solid ${shot.uiDensity===d ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
            color: shot.uiDensity===d ? "#DCE4FF" : "var(--ink-2)", cursor:"pointer" }}>{d}</button>
        ))}
      </div>
    </Field>
    <Field label="COLOR PALETTE">
      <div style={{ display:"flex", gap:6 }}>
        {shot.palette.map((c,i)=>(<div key={i} style={{ flex:1, height:32, borderRadius:8, background:c, border:"1px solid rgba(255,255,255,0.08)" }}/>))}
      </div>
    </Field>
    <Field label="DURATION">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:'"Geist Mono", monospace' }}>
        <span style={{ fontSize:18, color:"var(--ink-1)" }}>{shot.dur.toFixed(1)}s</span>
        <span style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.08em" }}>{Math.round(shot.dur*24)} FRAMES @ 24FPS</span>
      </div>
      <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,0.06)", marginTop:8, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(shot.dur/4.0)*100}%`, background:"linear-gradient(90deg, #7AA2FF, #A78BFA)" }}/>
      </div>
    </Field>
    <Field label="TRANSITION OUT">
      <Chips options={["Hard cut","Crossfade","Whip pan","Match cut","Speed ramp","Fade to black"]} active={shot.transitionOut}/>
    </Field>
  </>
);

/* ─────── Pipeline timeline (bottom, full width) ─────── */

const PipelineTimeline = ({ shots, selected, onSelect, f }) => {
  const total = shots.reduce((a,s)=>a+s.dur, 0);
  const stages = ["board","image","video","stitch"];
  const labels = { board:"STORYBOARD", image:"IMAGE", video:"VIDEO", stitch:"STITCH" };
  const colors = { board:"#7AA2FF", image:"#A78BFA", video:"#67E8F9", stitch:"#A6F0BD" };
  return (
    <div style={{ borderTop:"1px solid var(--line)", background:"rgba(8,9,13,0.55)", padding:"14px 28px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span className="mf-eyebrow">PIPELINE TIMELINE</span>
        <span className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.08em" }}>{shots.length} SHOTS · {total.toFixed(1)}s · STITCHED AT 24FPS</span>
      </div>
      {stages.map(st => (
        <div key={st} style={{ display:"grid", gridTemplateColumns:"96px 1fr", gap:10, alignItems:"center", marginBottom:4 }}>
          <div className="mf-mono" style={{ fontSize:10, color:"var(--ink-3)", letterSpacing:"0.1em" }}>{labels[st]}</div>
          <div style={{ display:"flex", gap:2, height:22 }}>
            {shots.map((s, i) => {
              const status = s.status[st];
              const c = colors[st];
              const bg = status === "done"
                ? `linear-gradient(90deg, ${c}55, ${c}33)`
                : status === "running"
                ? `linear-gradient(90deg, ${c}AA, ${c}33 ${(f*1.4)%100}%, ${c}11)`
                : "rgba(255,255,255,0.025)";
              const border = status === "done" ? `1px solid ${c}66`
                : status === "running" ? `1px solid ${c}AA`
                : "1px dashed var(--line-2)";
              return (
                <button key={s.id} onClick={()=>onSelect(i)} style={{
                  flex: s.dur, height:"100%", borderRadius:4,
                  background: bg, border,
                  outline: selected===i ? `1px solid #7AA2FF` : "none",
                  outlineOffset: selected===i ? 1 : 0,
                  cursor:"pointer", display:"flex", alignItems:"center", paddingLeft:6,
                  overflow:"hidden", fontFamily:"inherit"
                }}>
                  <span className="mf-mono" style={{ fontSize:9, color: status==="queued" ? "var(--ink-4)" : "rgba(255,255,255,0.85)", letterSpacing:"0.06em" }}>{s.id}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─────── Visual helpers ─────── */

const ShotThumb = ({ shot, w, h = 60, f = 0 }) => {
  const grad = `linear-gradient(135deg, ${shot.palette[0]}, ${shot.palette[1] || "#1F2937"} 55%, ${shot.palette[2] || shot.palette[0]})`;
  return (
    <div style={{ width:w, height:h, borderRadius:8, background: grad, position:"relative", flexShrink:0, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>
      <ShotComposition shot={shot} f={f} mini/>
      <div className="mf-mono" style={{ position:"absolute", top:4, left:6, fontSize:8, color:"rgba(255,255,255,0.85)", letterSpacing:"0.06em" }}>{shot.id}</div>
      <div className="mf-mono" style={{ position:"absolute", bottom:4, right:6, fontSize:8, color:"rgba(255,255,255,0.7)", letterSpacing:"0.06em" }}>{shot.dur.toFixed(1)}s</div>
    </div>
  );
};

/* Schematic visual for each shot's composition — never stock photo */
const ShotComposition = ({ shot, f = 0, mini = false }) => {
  const scale = mini ? 0.4 : 1;
  const ui = (
    <div style={{ position:"absolute", inset:0 }}>
      {/* Aurora bloom */}
      <div style={{ position:"absolute", left:"50%", top:"-20%", width:"80%", height:"80%", borderRadius:"50%",
        background:`radial-gradient(circle, ${shot.palette[1] || "#7AA2FF"}33, transparent 60%)`,
        filter:"blur(28px)", transform:"translateX(-50%)" }}/>
      {/* Subtle grid */}
      <div style={{ position:"absolute", inset:0, opacity:0.18, backgroundImage:"linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)", backgroundSize: mini ? "12px 12px" : "32px 32px", maskImage:"radial-gradient(ellipse at center, black 30%, transparent 75%)", WebkitMaskImage:"radial-gradient(ellipse at center, black 30%, transparent 75%)" }}/>
    </div>
  );

  // Shot-specific schematic
  if (shot.kind === "ui-hero") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <FakeWindow x="20%" y="22%" w="68%" h="62%" tilt={-3} f={f} mini={mini}/>
      </div>
    );
  }
  if (shot.kind === "ui-macro") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <FakeTimeline x="-4%" y="32%" w="108%" h="40%" f={f} mini={mini}/>
      </div>
    );
  }
  if (shot.kind === "ui-detail") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <FakeWindow x="46%" y="18%" w="48%" h="70%" tilt={0} variant="caption" f={f} mini={mini}/>
      </div>
    );
  }
  if (shot.kind === "ui-stack") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <FakeWindow x="14%" y="14%" w="56%" h="60%" tilt={-2} depth={2} mini={mini}/>
        <FakeWindow x="28%" y="28%" w="56%" h="60%" tilt={-2} depth={1} mini={mini}/>
        <FakeWindow x="42%" y="42%" w="48%" h="50%" tilt={-2} depth={0} mini={mini}/>
      </div>
    );
  }
  if (shot.kind === "social") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <FakeCreatorCard x="6%" y="14%" w="50%" h="72%" mini={mini}/>
      </div>
    );
  }
  if (shot.kind === "reveal") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <div style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", fontFamily:'"Geist", system-ui', fontWeight:700, fontSize: mini ? 18 : 72, letterSpacing:"-0.04em", color:"rgba(255,255,255,0.95)", textShadow:"0 0 40px rgba(167,139,250,0.6)" }}>
          {shot.overlay}
        </div>
      </div>
    );
  }
  if (shot.kind === "cta") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <div style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", textAlign:"center" }}>
          <div className="mf-mono" style={{ fontSize: mini ? 7 : 11, letterSpacing:"0.18em", color:"#7AA2FF", marginBottom: mini ? 4 : 12 }}>LATTICE</div>
          <div style={{ fontFamily:'"Geist", system-ui', fontWeight:500, fontSize: mini ? 14 : 44, letterSpacing:"-0.025em" }}>{shot.overlay}</div>
        </div>
      </div>
    );
  }
  if (shot.kind === "film") {
    return (
      <div style={{ position:"absolute", inset:0 }}>
        {ui}
        <div style={{ position:"absolute", left:0, right:0, top:0, height:"14%", background:"#000" }}/>
        <div style={{ position:"absolute", left:0, right:0, bottom:0, height:"14%", background:"#000" }}/>
        <div style={{ position:"absolute", left:"60%", top:"30%", width:"22%", height:"40%", borderRadius:"50%", background:`radial-gradient(circle, ${shot.palette[1]}, transparent 60%)`, filter:"blur(8px)" }}/>
      </div>
    );
  }
  // atmosphere
  return ui;
};

const FakeWindow = ({ x, y, w, h, tilt = 0, depth = 0, variant, f = 0, mini }) => (
  <div style={{
    position:"absolute", left:x, top:y, width:w, height:h,
    borderRadius: mini ? 4 : 12, overflow:"hidden",
    background:"linear-gradient(180deg, #0E1018, #06070A)",
    border:"1px solid rgba(255,255,255,0.10)",
    transform: `rotate(${tilt}deg)`,
    boxShadow:`0 ${mini?6:24}px ${mini?12:60}px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)`,
    opacity: 1 - depth*0.25,
  }}>
    {/* titlebar */}
    <div style={{ height: mini ? 6 : 18, background:"rgba(255,255,255,0.04)", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", padding:"0 6px", gap:3 }}>
      <span style={{ width: mini?3:6, height: mini?3:6, borderRadius:"50%", background:"#FF5F57" }}/>
      <span style={{ width: mini?3:6, height: mini?3:6, borderRadius:"50%", background:"#FEBC2E" }}/>
      <span style={{ width: mini?3:6, height: mini?3:6, borderRadius:"50%", background:"#28C840" }}/>
    </div>
    {variant === "caption" ? <FakeCaptionEditor mini={mini}/> : <FakeDashboard mini={mini} f={f}/>}
  </div>
);

const FakeDashboard = ({ mini, f = 0 }) => (
  <div style={{ display:"grid", gridTemplateColumns: mini ? "20% 1fr" : "22% 1fr", height:"calc(100% - 18px)", gap: mini ? 2 : 6, padding: mini ? 3 : 8 }}>
    <div style={{ background:"rgba(255,255,255,0.025)", borderRadius: mini?2:6, padding: mini?2:6, display:"flex", flexDirection:"column", gap: mini?2:4 }}>
      {Array.from({length: mini?4:6}).map((_,i)=>(
        <div key={i} style={{ height: mini?3:6, borderRadius: mini?1:3, background: i===1 ? "rgba(122,162,255,0.35)" : "rgba(255,255,255,0.05)" }}/>
      ))}
    </div>
    <div style={{ display:"flex", flexDirection:"column", gap: mini?2:6 }}>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: mini?2:6, height: mini?12:32 }}>
        {[0,1,2].map(i=>(
          <div key={i} style={{ background:"rgba(255,255,255,0.025)", borderRadius: mini?2:6, padding: mini?2:6 }}>
            <div style={{ height: mini?2:4, width:"40%", background:"rgba(255,255,255,0.10)", borderRadius:1 }}/>
            <div style={{ height: mini?3:8, width:"60%", background:i===1 ? "rgba(122,162,255,0.40)" : "rgba(255,255,255,0.20)", borderRadius:1, marginTop: mini?2:4 }}/>
          </div>
        ))}
      </div>
      {/* chart */}
      <div style={{ flex:1, background:"rgba(255,255,255,0.02)", borderRadius: mini?2:6, position:"relative", overflow:"hidden", padding: mini?2:6 }}>
        <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`g${mini?"m":"f"}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7AA2FF" stopOpacity="0.55"/>
              <stop offset="100%" stopColor="#7AA2FF" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={`M0,32 C15,24 25,30 35,22 C45,16 55,${20+Math.sin(f/40)*2} 65,14 C75,8 85,12 100,6 L100,40 L0,40 Z`} fill={`url(#g${mini?"m":"f"})`}/>
          <path d={`M0,32 C15,24 25,30 35,22 C45,16 55,${20+Math.sin(f/40)*2} 65,14 C75,8 85,12 100,6`} stroke="#7AA2FF" strokeWidth="0.8" fill="none"/>
        </svg>
      </div>
    </div>
  </div>
);

const FakeCaptionEditor = ({ mini }) => (
  <div style={{ padding: mini?3:10, display:"flex", flexDirection:"column", gap: mini?2:6, height:"calc(100% - 18px)" }}>
    <div style={{ height: mini?3:6, width:"40%", background:"rgba(255,255,255,0.12)", borderRadius:1 }}/>
    <div style={{ height: mini?3:6, width:"70%", background:"rgba(255,255,255,0.06)", borderRadius:1 }}/>
    <div style={{ flex:1, background:"rgba(122,162,255,0.06)", border:"1px solid rgba(122,162,255,0.2)", borderRadius: mini?2:4, position:"relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
        {Array.from({length:30}).map((_,i)=>{
          const h = 6 + Math.abs(Math.sin(i*0.7))*10;
          return <rect key={i} x={i*3.2} y={(20-h)/2} width="1.4" height={h} fill="#7AA2FF" opacity="0.6"/>;
        })}
      </svg>
    </div>
    <div style={{ display:"flex", gap: mini?2:4 }}>
      <div style={{ height: mini?4:10, flex:1, background:"rgba(255,255,255,0.06)", borderRadius: mini?1:3 }}/>
      <div style={{ height: mini?4:10, width: mini?12:30, background:"rgba(122,162,255,0.30)", borderRadius: mini?1:3 }}/>
    </div>
  </div>
);

const FakeTimeline = ({ x, y, w, h, f = 0, mini }) => (
  <div style={{ position:"absolute", left:x, top:y, width:w, height:h, display:"flex", flexDirection:"column", gap: mini?2:6, padding: mini?2:8 }}>
    {[
      { c:"rgba(122,162,255,0.45)", segs:[18, 22, 12, 28] },
      { c:"rgba(167,139,250,0.45)", segs:[14, 14, 24, 18] },
      { c:"rgba(255,255,255,0.10)", segs:[10, 20, 16, 22], waveform:true },
    ].map((tr, ti) => (
      <div key={ti} style={{ flex:1, display:"flex", gap: mini?1:3, alignItems:"stretch" }}>
        {tr.segs.map((seg, si) => (
          <div key={si} style={{ flex:seg, borderRadius: mini?1:4, background: tr.c, border:"1px solid rgba(255,255,255,0.06)", position:"relative", overflow:"hidden" }}>
            {tr.waveform && (
              <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
                {Array.from({length:20}).map((_,i)=>{
                  const v = 8 + Math.abs(Math.sin((i+si*3)*0.6))*16;
                  return <rect key={i} x={i*5} y={(30-v)/2} width="1.4" height={v} fill="rgba(255,255,255,0.45)"/>;
                })}
              </svg>
            )}
          </div>
        ))}
      </div>
    ))}
    {/* Playhead */}
    <div style={{ position:"absolute", top:0, bottom:0, left:`${30 + Math.sin(f/40)*2}%`, width:1, background:"#7AA2FF", boxShadow:"0 0 8px #7AA2FF" }}/>
  </div>
);

const FakeCreatorCard = ({ x, y, w, h, mini }) => (
  <div style={{ position:"absolute", left:x, top:y, width:w, height:h,
    background:"linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    borderRadius: mini?4:14, border:"1px solid rgba(255,255,255,0.10)", padding: mini?6:18,
    display:"flex", flexDirection:"column", gap: mini?3:10, backdropFilter:"blur(20px)", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
    <div style={{ display:"flex", alignItems:"center", gap: mini?3:10 }}>
      <div style={{ width: mini?10:38, height: mini?10:38, borderRadius:"50%", background:"linear-gradient(135deg,#A78BFA,#F472B6)" }}/>
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap: mini?1:4 }}>
        <div style={{ height: mini?2:6, width:"60%", background:"rgba(255,255,255,0.18)", borderRadius:1 }}/>
        <div style={{ height: mini?1.5:4, width:"40%", background:"rgba(255,255,255,0.08)", borderRadius:1 }}/>
      </div>
    </div>
    <div style={{ flex:1, display:"flex", flexDirection:"column", gap: mini?1:5 }}>
      {[100,90,80,60].map((w,i)=>(<div key={i} style={{ height: mini?1.5:4, width:`${w}%`, background:"rgba(255,255,255,0.10)", borderRadius:1 }}/>))}
    </div>
  </div>
);

/* ─────── Tiny shared ─────── */

const Field = ({ label, children, mono }) => (
  <div style={{ marginBottom:14 }}>
    <div className={mono ? "mf-mono" : ""} style={{ fontSize: mono?10:10, color:"var(--ink-3)", letterSpacing: mono?"0.12em":"0.12em", marginBottom:6, fontWeight: mono?400:500, textTransform:"uppercase" }}>{label}</div>
    {children}
  </div>
);

const Tag = ({ children }) => (
  <span style={{ display:"inline-flex", alignItems:"center", padding:"3px 8px", borderRadius:999, background:"rgba(255,255,255,0.03)", border:"1px solid var(--line)", color:"var(--ink-2)", fontSize:10.5 }} className="mf-mono">{children}</span>
);

const Chips = ({ options, active }) => (
  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
    {options.map((o,i)=>{
      const a = o.toLowerCase().includes(String(active||"").toLowerCase()) || String(active||"").toLowerCase().includes(o.toLowerCase());
      return (
        <button key={i} style={{ padding:"5px 9px", borderRadius:7, fontFamily:"inherit", fontSize:11,
          background: a ? "rgba(122,162,255,0.10)" : "rgba(255,255,255,0.025)",
          border:`1px solid ${a ? "rgba(122,162,255,0.30)" : "var(--line)"}`,
          color: a ? "#DCE4FF" : "var(--ink-2)", cursor:"pointer" }}>{o}</button>
      );
    })}
  </div>
);

const ShotStatusDot = ({ status }) => {
  const running = Object.values(status).includes("running");
  const allDone = Object.values(status).every(s => s === "done");
  const c = allDone ? "#A6F0BD" : running ? "#7AA2FF" : "var(--ink-4)";
  const label = allDone ? "READY" : running ? "RUNNING" : "QUEUED";
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }} className="mf-mono">
      <span style={{ width:6, height:6, borderRadius:"50%", background:c, boxShadow: running ? `0 0 8px ${c}` : "none" }}/>
      <span style={{ fontSize:9.5, letterSpacing:"0.1em", color:"var(--ink-3)" }}>{label}</span>
    </span>
  );
};

const DirBracket = ({ pos }) => {
  const corners = {
    tl: { top:-1, left:-1, borderLeft:"2px solid #7AA2FF", borderTop:"2px solid #7AA2FF" },
    tr: { top:-1, right:-1, borderRight:"2px solid #7AA2FF", borderTop:"2px solid #7AA2FF" },
    bl: { bottom:-1, left:-1, borderLeft:"2px solid #7AA2FF", borderBottom:"2px solid #7AA2FF" },
    br: { bottom:-1, right:-1, borderRight:"2px solid #7AA2FF", borderBottom:"2px solid #7AA2FF" },
  };
  return <div style={{ position:"absolute", width:14, height:14, ...corners[pos] }}/>;
};

window.DirectorScreen = DirectorScreen;

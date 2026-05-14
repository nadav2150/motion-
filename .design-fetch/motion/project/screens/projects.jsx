/* Projects — list of projects, click to open editor */
const ProjectsScreen = ({ onNav, onOpenProject }) => {
  const [view, setView] = useState("grid");

  const projects = [
    { t: "Lattice — Q4 launch",       u: "Updated 2m ago",   s: "Editing",   d: "60s · 4K",  c: "linear-gradient(135deg, #7AA2FF, #A78BFA)", tone: "glow" },
    { t: "Hex — AI feature reel",     u: "Updated 1h ago",   s: "Rendering", d: "30s · 4K",  c: "linear-gradient(135deg, #5468FF, #2D3340)", tone: "default" },
    { t: "Cresta — funding video",    u: "Updated yesterday",s: "Ready",     d: "45s · 4K",  c: "linear-gradient(135deg, #67E8F9, #7AA2FF)", tone: "success" },
    { t: "Arc — social reel",         u: "Updated 3d ago",   s: "Draft",     d: "15s · 9:16",c: "linear-gradient(135deg, #F472B6, #7AA2FF)", tone: "default" },
    { t: "Figma — product recap",     u: "Updated 1w ago",   s: "Ready",     d: "90s · 4K",  c: "linear-gradient(135deg, #A78BFA, #67E8F9)", tone: "success" },
    { t: "Cresta — onboarding film",  u: "Updated 2w ago",   s: "Archived",  d: "75s · 4K",  c: "linear-gradient(135deg, #1F2937, #5468FF)", tone: "default" },
  ];

  return (
    <AppChrome
      active="projects"
      onNav={onNav}
      project="Projects"
      right={
        <>
          <div style={{ display: "flex", padding: 3, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
            {["grid","list"].map(v => (
              <button key={v} onClick={()=>setView(v)} style={{
                padding: "5px 10px", fontSize: 11, borderRadius: 5,
                background: view===v ? "rgba(255,255,255,0.06)" : "transparent",
                border: view===v ? "1px solid var(--line-2)" : "1px solid transparent",
                color: view===v ? "var(--ink-0)" : "var(--ink-3)", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize"
              }}>{v}</button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={onOpenProject} iconRight={<IconPlus size={14}/>}>New project</Button>
        </>
      }>
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: "48px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>WORKSPACE · LATTICE</div>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: 40 }}>
            Projects <span style={{ color: "var(--ink-3)" }}>· {projects.length} films in flight</span>
          </h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {projects.map((p, i) => {
            const dot = p.s === "Ready" ? "#A6F0BD" : p.s === "Rendering" ? "#7AA2FF" : p.s === "Editing" ? "#67E8F9" : "var(--ink-4)";
            return (
              <button key={i} onClick={onOpenProject} style={{
                padding: 0, borderRadius: 14, overflow: "hidden",
                background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "all 240ms cubic-bezier(.2,.8,.2,1)"
              }}
              onMouseEnter={(e)=>{e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.borderColor="var(--line-2)"; e.currentTarget.style.boxShadow="0 20px 40px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.10)";}}
              onMouseLeave={(e)=>{e.currentTarget.style.transform=""; e.currentTarget.style.borderColor="var(--line)"; e.currentTarget.style.boxShadow="";}}>
                <div style={{ aspectRatio: "16/10", background: p.c, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 55%)" }}/>
                  <div style={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, boxShadow: `0 0 8px ${dot}` }}/> {p.s}
                  </div>
                  <div style={{ position: "absolute", right: 12, bottom: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", paddingLeft: 2, color: "white" }}>
                    <IconPlay size={12}/>
                  </div>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.015em" }}>{p.t}</div>
                    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 4 }}>{p.u.toUpperCase()}</div>
                  </div>
                  <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>{p.d}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </AppChrome>
  );
};

window.ProjectsScreen = ProjectsScreen;

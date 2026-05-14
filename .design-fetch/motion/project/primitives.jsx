/* MotionFlow AI — shared primitives & icons */
const { useState: _useState, useEffect: _useEffect, useRef: _useRef, useMemo: _useMemo } = React;
// re-bind via let to avoid top-level const collision across babel scripts
var useState = _useState, useEffect = _useEffect, useRef = _useRef, useMemo = _useMemo;

/* ───────── Icons (custom, minimal stroke) ───────── */
const Icon = ({ d, size = 16, stroke = 1.5, fill = "none", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d}
  </svg>
);
const IconUpload = (p) => <Icon {...p} d={<><path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/></>} />;
const IconSparkle = (p) => <Icon {...p} d={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>} />;
const IconArrowRight = (p) => <Icon {...p} d={<><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></>} />;
const IconPlay = (p) => <Icon {...p} fill="currentColor" stroke="none" d={<path d="M8 5v14l11-7z"/>} />;
const IconPause = (p) => <Icon {...p} fill="currentColor" stroke="none" d={<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>} />;
const IconCheck = (p) => <Icon {...p} d={<path d="m4 12 5 5L20 6"/>} />;
const IconImage = (p) => <Icon {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></>} />;
const IconText = (p) => <Icon {...p} d={<><path d="M4 7V5h16v2"/><path d="M9 5v14"/><path d="M15 5v14"/><path d="M7 19h10"/></>} />;
const IconPalette = (p) => <Icon {...p} d={<><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 22a10 10 0 1 1 10-10c0 1.5-1 3-3 3h-2a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 1 1 0 0 0-1 2z"/></>} />;
const IconWand = (p) => <Icon {...p} d={<><path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M3 21 14 10"/><path d="m17 7 4 4"/></>} />;
const IconShare = (p) => <Icon {...p} d={<><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></>} />;
const IconDownload = (p) => <Icon {...p} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>} />;
const IconLink = (p) => <Icon {...p} d={<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>} />;
const IconScissors = (p) => <Icon {...p} d={<><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></>} />;
const IconLayers = (p) => <Icon {...p} d={<><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></>} />;
const IconChevron = (p) => <Icon {...p} d={<path d="m6 9 6 6 6-6"/>} />;
const IconClose = (p) => <Icon {...p} d={<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>} />;
const IconPlus = (p) => <Icon {...p} d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} />;
const IconMusic = (p) => <Icon {...p} d={<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>} />;
const IconMic = (p) => <Icon {...p} d={<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/></>} />;
const IconCamera = (p) => <Icon {...p} d={<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>} />;
const IconType = (p) => <Icon {...p} d={<><path d="M4 7V5h16v2"/><path d="M9 5v14"/><path d="M15 5v14"/></>} />;
const IconLibrary = (p) => <Icon {...p} d={<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>} />;
const IconHome = (p) => <Icon {...p} d={<><path d="M3 11 12 3l9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></>} />;
const IconFolder = (p) => <Icon {...p} d={<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>} />;
const IconSettings = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>} />;
const IconLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
        <stop offset="0" stopColor="#7AA2FF"/>
        <stop offset="0.5" stopColor="#A78BFA"/>
        <stop offset="1" stopColor="#67E8F9"/>
      </linearGradient>
    </defs>
    <path d="M6 22 L6 10 L12 16 L18 10 L18 22" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="24" cy="16" r="2.5" fill="url(#lg)"/>
  </svg>
);

/* ───────── Surfaces & Buttons ───────── */
const Glass = ({ children, style, className = "", ...rest }) => (
  <div className={`mf-glass ${className}`} style={style} {...rest}>{children}</div>
);

const Button = ({ children, variant = "primary", size = "md", icon, iconRight, onClick, style }) => {
  const cls = `mf-btn mf-btn-${variant} mf-btn-${size}`;
  return (
    <button className={cls} onClick={onClick} style={style}>
      {icon && <span className="mf-btn-icon">{icon}</span>}
      <span>{children}</span>
      {iconRight && <span className="mf-btn-icon">{iconRight}</span>}
    </button>
  );
};

const Pill = ({ children, tone = "default", icon }) => (
  <span className={`mf-pill mf-pill-${tone}`}>
    {icon && <span style={{display:"inline-flex"}}>{icon}</span>}
    {children}
  </span>
);

/* Top nav, used on landing only */
const TopNav = ({ onCta }) => (
  <nav className="mf-nav">
    <div className="mf-nav-brand">
      <IconLogo size={22}/>
      <span>MotionFlow</span>
      <span className="mf-nav-badge">AI</span>
    </div>
    <div className="mf-nav-links">
      <a>Product</a><a>Showcase</a><a>Pricing</a><a>Docs</a>
    </div>
    <div className="mf-nav-cta">
      <a className="mf-nav-link">Sign in</a>
      <Button size="sm" variant="primary" onClick={onCta} iconRight={<IconArrowRight size={14}/>}>Start free</Button>
    </div>
  </nav>
);

/* App chrome — used on screens 2–5 */
const AppChrome = ({ active, onNav, project = "Untitled launch", children, right }) => (
  <div className="mf-app">
    <aside className="mf-side">
      <div className="mf-side-brand">
        <IconLogo size={22}/>
      </div>
      <div className="mf-side-stack">
        {[
          {k:"home",     icon:<IconHome size={18}/>,     label:"Home"},
          {k:"projects", icon:<IconFolder size={18}/>,   label:"Projects"},
          {k:"settings", icon:<IconSettings size={16}/>, label:"Settings"},
        ].map(it => (
          <button key={it.k} className={`mf-side-btn ${active===it.k?"is-active":""}`} onClick={()=>onNav?.(it.k)} title={it.label}>
            {it.icon}
          </button>
        ))}
      </div>
      <div className="mf-side-foot">
        <div className="mf-avatar">EL</div>
      </div>
    </aside>
    <main className="mf-main">
      <header className="mf-topbar">
        <div className="mf-crumb">
          <span className="mf-crumb-muted">Projects</span>
          <IconChevron size={12} style={{transform:"rotate(-90deg)", opacity:0.4}}/>
          <span>{project}</span>
        </div>
        <div className="mf-topbar-right">{right}</div>
      </header>
      <div className="mf-content">{children}</div>
    </main>
  </div>
);

/* Striped image placeholder per spec */
const Placeholder = ({ label, w, h, style, accent = "rgba(255,255,255,0.05)" }) => (
  <div className="mf-ph" style={{ width:w, height:h, ...style }}>
    <div className="mf-ph-stripes" style={{
      backgroundImage:`repeating-linear-gradient(135deg, ${accent} 0 8px, transparent 8px 16px)`
    }}/>
    <div className="mf-ph-label">{label}</div>
  </div>
);

/* Animated cinematic preview frame — abstract gradient motion, no SVG illustration */
const CinemaPreview = ({ aspect = "16 / 9", label, frame = 0, style, children }) => {
  return (
    <div className="mf-cinema" style={{ aspectRatio: aspect, ...style }}>
      <div className="mf-cinema-grain"/>
      <div className="mf-cinema-orb mf-cinema-orb-a" style={{ transform:`translate3d(${Math.sin(frame/40)*40}px, ${Math.cos(frame/55)*30}px, 0)` }}/>
      <div className="mf-cinema-orb mf-cinema-orb-b" style={{ transform:`translate3d(${Math.cos(frame/30)*60}px, ${Math.sin(frame/45)*40}px, 0)` }}/>
      <div className="mf-cinema-orb mf-cinema-orb-c" style={{ transform:`translate3d(${Math.sin(frame/60)*50}px, ${Math.sin(frame/35)*25}px, 0)` }}/>
      <div className="mf-cinema-vignette"/>
      {label && <div className="mf-cinema-label">{label}</div>}
      {children}
    </div>
  );
};

/* useFrame — rAF tick for ambient motion */
const useFrame = (running = true) => {
  const [f, setF] = useState(0);
  useEffect(() => {
    if (!running) return;
    let id, alive = true;
    const tick = () => { setF(x => x + 1); if (alive) id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(id); };
  }, [running]);
  return f;
};

Object.assign(window, {
  Icon, IconUpload, IconSparkle, IconArrowRight, IconPlay, IconPause, IconCheck,
  IconImage, IconText, IconPalette, IconWand, IconShare, IconDownload, IconLink,
  IconScissors, IconLayers, IconChevron, IconClose, IconPlus, IconMusic, IconMic, IconCamera, IconType, IconLibrary, IconHome, IconFolder, IconSettings,
  IconLogo, Glass, Button, Pill, TopNav, AppChrome, Placeholder, CinemaPreview, useFrame
});

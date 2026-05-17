// Iframe shims injected into a scene's HTML before it loads in
// `HtmlScenePane` / `ScenePreviewModal`. They cover three concerns:
//   1. fit the scene's stage element to the iframe viewport (center + scale)
//   2. for single-scene previews, scope the master timeline to one scene's
//      window and loop within it
//   3. forward iframe console output to the parent for unified debugging

// CSS + JS block that pins the scene's stage to the viewport center and
// scales it to fit. Transform order is load-bearing — see inline comments:
// translate runs AFTER scale (CSS right-to-left chain), so the translate
// offset is scaled too, which keeps the visual center on body's 50%/50%
// anchor regardless of the scene's intrinsic resolution. Swapping the order
// (translate then scale) leaves the offset un-scaled and miscentres.
// The element's own transform places it, full stop.
export const fitToViewportShim = `
<style id="mg-preview-fit">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    background: #050505 !important;
  }
  body { position: relative !important; }
  #stage, #root {
    position: absolute !important;
    left: 50% !important;
    top: 50% !important;
    transform-origin: 0 0 !important;
    margin: 0 !important;
  }
</style>
<script id="mg-preview-fit-script">
(function(){
  var stage = null;
  function fit(){
    if (!stage) stage = document.getElementById("stage") || document.getElementById("root");
    if (!stage) return;
    var w = parseFloat(stage.getAttribute("data-width")) || 1920;
    var h = parseFloat(stage.getAttribute("data-height")) || 1080;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    if (vw <= 0 || vh <= 0) return;
    var s = Math.min(vw / w, vh / h);
    // translate(-50%, -50%) shifts the element's OWN top-left back by half its
    // own (unscaled) box, so the visual center lands on body's 50%/50% anchor.
    // Then scale(s) shrinks around top-left (transform-origin: 0 0), but the
    // shift was computed against the unscaled box so visual centering survives.
    // Transform order matters: scale runs LAST (applied first to the point in
    // CSS's right-to-left chain), so translate(-50%, -50%) in unscaled local
    // coords becomes (-s*half, -s*half) in body coords — i.e. the offset is
    // also scaled, matching the visual element size exactly. Reversing this
    // (translate then scale) leaves the offset un-scaled and miscentres.
    stage.style.transform = "scale(" + s + ") translate(-50%, -50%)";
    try { console.log("[fit] viewport", vw, "x", vh, "stage", w, "x", h, "→ scale", s.toFixed(4)); } catch(_) {}
  }
  var start = (performance && performance.now) ? performance.now() : Date.now();
  function tick(){
    fit();
    var now = (performance && performance.now) ? performance.now() : Date.now();
    if (now - start < 1000) requestAnimationFrame(tick);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tick);
  } else { tick(); }
  window.addEventListener("resize", fit);
  if (typeof ResizeObserver !== "undefined") {
    try { new ResizeObserver(fit).observe(document.documentElement); } catch(_) {}
  }
})();
</script>`;

// The scene iframe is a *passive slave* of the editor's global clock. Each
// scene's composition.html declares its own scene-local GSAP timeline via
// `gsap.timeline({ paused: true })` and registers it as
// `window.__timelines[<sceneId>] = tl` (see emit.ts). Then it calls
// `tl.play()` on DOMContentLoaded — that auto-play is what we override.
//
// The shim:
//   1. Polls `window.__timelines` until ANY entry appears (we don't know
//      the scene id, and there's exactly one per file).
//   2. Pauses that timeline so it stops self-driving.
//   3. Listens for `{ __mgClock, type: "seek", seconds }` and runs
//      `tl.time(seconds)`. The parent sends scene-LOCAL seconds (i.e.
//      globalTime - sceneStart), because each composition's t=0 is its own
//      scene's start, not the start of the film.
//
// We also poll defensively after attach: GSAP's `play()` schedule on
// DOMContentLoaded might run AFTER our pause(), so we re-pause any time we
// detect tl.isActive() === true and no seek message has arrived recently.
export const sceneClockSlaveShim = `
<script id="mg-scene-clock-slave">
(function(){
  var pending = null;       // last requested time while tl wasn't ready
  var tl = null;
  var seeksReceived = 0;
  var lastLoggedSeek = -1;
  var unpauseEvents = 0;
  function findTimeline(){
    var bag = window.__timelines;
    if (!bag || typeof bag !== "object") return null;
    for (var k in bag) { if (bag[k]) return bag[k]; }
    return null;
  }
  function apply(s){
    seeksReceived++;
    if (!tl) { pending = s; return; }
    try {
      tl.pause();
      tl.time(s, false);
      // tl.time() alone doesn't force a render in some GSAP builds — call
      // invalidate + render at the new time to be safe.
      if (typeof tl.render === "function") tl.render(s, false, true);
    } catch(e){
      try { console.warn("[mg-clock-slave] seek failed", e && e.message); } catch(_) {}
    }
  }
  function attach(){
    tl = findTimeline();
    if (!tl) { setTimeout(attach, 16); return; }
    try { tl.pause(); } catch(e){}
    try { console.log("[mg-clock-slave] attached, tl duration", tl.duration && tl.duration()); } catch(_) {}
    if (pending != null) apply(pending);
    // Belt-and-suspenders: if anything (composition's own DOMContentLoaded
    // handler) re-plays the timeline, force it back to paused. Also count
    // how often that happens — if it's every frame, something is fighting us.
    function guard(){
      if (tl && typeof tl.paused === "function" && !tl.paused()) {
        try { tl.pause(); } catch(_) {}
        unpauseEvents++;
      }
      requestAnimationFrame(guard);
    }
    requestAnimationFrame(guard);
    // Once a second, dump state so we can see whether seeks are landing
    // and whether the timeline is staying paused at the right time.
    setInterval(function(){
      try {
        var t = tl.time ? tl.time() : "?";
        var p = tl.paused ? tl.paused() : "?";
        console.log("[mg-clock-slave] state · tl.time=" + (typeof t === "number" ? t.toFixed(3) : t) + "s · paused=" + p + " · seeks_since_last=" + (seeksReceived - lastLoggedSeek) + " · unpause_events=" + unpauseEvents);
        lastLoggedSeek = seeksReceived;
      } catch(_) {}
    }, 1000);
  }
  window.addEventListener("message", function(e){
    var d = e.data;
    if (!d || !d.__mgClock) return;
    if (d.type === "seek" && typeof d.seconds === "number") {
      apply(d.seconds);
    }
  });
  attach();
  try { parent.postMessage({ __mgClock: true, type: "ready" }, "*"); } catch(_) {}
})();
</script>`;

// Forward all iframe console output + uncaught errors + unhandled promise
// rejections to the parent window via postMessage, so the developer sees one
// merged log stream in their DevTools when debugging a scene.
export const consoleBridgeShim = `
<script id="mg-console-bridge">
(function(){
  function serialize(args){
    try { return Array.prototype.slice.call(args).map(function(a){
      if (a && a.stack) return String(a.stack);
      if (typeof a === "object") { try { return JSON.stringify(a); } catch(_) { return String(a); } }
      return String(a);
    }); } catch(_) { return ["<unserializable log args>"]; }
  }
  function send(level, args){
    try {
      parent.postMessage({ __mgScene: true, level: level, args: serialize(args), url: location.href }, "*");
    } catch(_) {}
  }
  ["log","info","warn","error","debug"].forEach(function(level){
    var orig = console[level];
    console[level] = function(){ send(level, arguments); try { orig.apply(console, arguments); } catch(_) {} };
  });
  window.addEventListener("error", function(e){
    send("error", [e.message + " @ " + (e.filename || "?") + ":" + (e.lineno || "?") + ":" + (e.colno || "?")]);
  });
  window.addEventListener("unhandledrejection", function(e){
    var r = e && (e.reason && (e.reason.stack || e.reason.message)) || String(e && e.reason);
    send("error", ["unhandledrejection: " + r]);
  });
  send("log", ["scene iframe loaded — bridge active"]);
})();
</script>`;

// `scope` is no longer used — kept on the signature so callers (e.g. the
// modal preview) compile unchanged. The iframe is always a clock slave now;
// the parent decides what time to send.
export function injectPreviewFit(
  html: string,
  _scope?: { startSeconds: number; durationSeconds: number },
): string {
  const head = fitToViewportShim + consoleBridgeShim;
  const tailScope = sceneClockSlaveShim;
  let out = html;
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${head}</head>`);
  } else {
    out = head + out;
  }
  if (out.includes("</body>")) {
    out = out.replace("</body>", `${tailScope}</body>`);
  } else {
    out = out + tailScope;
  }
  return out;
}

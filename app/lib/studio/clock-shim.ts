// Virtual clock injected into every Videly v2 document, in the renderer
// (page.addInitScript) and in the browser preview (first inline <script>).
//
// Preview postMessage protocol (parent <-> sandboxed iframe):
//   parent -> iframe: { type: "videly:seek", time } | { type: "videly:play" } | { type: "videly:pause" }
//   iframe -> parent: { type: "videly:ready", duration, width, height }
//                     { type: "videly:time", time, playing }
//                     { type: "videly:error", message }
// (targetOrigin "*" is fine: the iframe is sandboxed with an opaque origin and
// the parent only listens for these message types.)
//
// What the shim virtualises (all read the same virtual time `vt`, in ms):
//   - performance.now(), Date.now(), new Date(), Date() — Date uses a fixed
//     epoch 2026-01-01T00:00:00Z + vt; document.timeline.currentTime.
//   - requestAnimationFrame / cancelAnimationFrame — a queue flushed once per seek.
//   - setTimeout / setInterval / clear* / requestIdleCallback — a virtual-time
//     min-heap; due timers run in (time, insertion) order during a seek, with
//     vt set to each timer's own due time while it runs.
//   - Math.random, crypto.getRandomValues, crypto.randomUUID — seeded mulberry32.
//
// window.__videlyShim.seek(t) (t in seconds) runs, in order:
//   1. due timers (each sees vt = its due time; GSAP is advanced to that time first)
//   2. vt = t
//   3. GSAP: gsap.updateRoot(t) (the trap on window.gsap already set
//      lagSmoothing(0) and removed updateRoot from the ticker, so GSAP only moves
//      when we say so); then window.__videly.timeline.seek(t) if present
//   4. __videly.onSeek hooks (fn(t); may return a Promise, e.g. Lottie goToAndStop)
//   5. one rAF flush (callbacks get vt as their timestamp), then GSAP again so
//      tweens created inside rAF render at t
//   6. document.getAnimations() (CSS animations/transitions, WAAPI): each is
//      paused the first time it is seen and its birth vt is stored in a
//      WeakMap; currentTime = (vt - birth) * playbackRate (clamped >= 0).
//      SVG SMIL: svg.pauseAnimations(); svg.setCurrentTime(t).
//   7. <video> elements: pause, currentTime = t - (data-start || 0), await
//      'seeked' (2 s cap per video)
//   8. settle: wait for in-flight font loads and images that are still loading
//      (3 s cap), so late-inserted text/images never render with a fallback.
//
// Backward seeks: GSAP, WAAPI/CSS, SMIL, video and rAF loops that draw from
// performance.now() are pure functions of time and seek backwards correctly.
// Timers cannot be un-run: in preview a backward seek (including the loop back
// to 0) leaves timer side effects in place. That is why the director contract
// requires time-pure documents. The renderer detects a backward seek across a
// fired timer (state().lastTimerAt) and reloads the page instead.
//
// Readiness: __videlyShim.ready() resolves once document.fonts.ready, every
// <img> decode(), every <video> readyState >= 2 and the optional
// __videly.ready promise have settled, with a 15 s cap; the result lists which
// gates timed out.
//
// window.__videly: the document assigns { duration, fps, width, height } in
// <head>. A setter trap adds __videly.onSeek(fn) (registers fn(t), returns an
// unsubscribe function). If the document supplies its own onSeek function it is
// called as a hook on every seek instead.

export type ShimMode = "render" | "preview";

// Fixed epoch for Date in both modes: 2026-01-01T00:00:00Z.
export const SHIM_EPOCH_MS = Date.UTC(2026, 0, 1);

// Returns JavaScript source (no <script> tags) to run before any page script.
export function buildClockShim(opts: { seed: number; mode: ShimMode }): string {
  const seed = Number.isFinite(opts.seed) ? Math.trunc(opts.seed) >>> 0 : 0;
  const mode: ShimMode = opts.mode === "preview" ? "preview" : "render";
  return SHIM_SOURCE.replace("__SEED__", String(seed))
    .replace("__MODE__", mode)
    .replace("__EPOCH__", String(SHIM_EPOCH_MS));
}

// Plain ES2017 source. Everything goes through `W` (the window) so the unit
// test can run it against a fake window. Written as a string (not a serialised
// function) so bundlers cannot inject helpers into it.
const SHIM_SOURCE = /* js */ `(function (W) {
  "use strict";
  if (!W || W.__videlyShim) return;
  var SEED = __SEED__;
  var MODE = "__MODE__";
  var EPOCH = __EPOCH__;
  var DOC = W.document || null;
  var perf = W.performance || null;
  var realPerfNow = perf && perf.now ? perf.now.bind(perf) : function () { return new Date().getTime(); };
  var realRAF = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : null;
  var realSetTimeout = W.setTimeout ? W.setTimeout.bind(W) : null;
  var realClearTimeout = W.clearTimeout ? W.clearTimeout.bind(W) : null;
  var RealDate = W.Date;
  var vt = 0; // virtual time, ms
  var lastTimerAt = -1; // latest due time of a timer that has run, ms
  var issues = [];

  function report(err) {
    try {
      if (typeof W.reportError === "function") { W.reportError(err); return; }
    } catch (e) {}
    if (realSetTimeout) realSetTimeout(function () { throw err; }, 0);
  }
  function def(obj, key, value) {
    try { Object.defineProperty(obj, key, { value: value, configurable: true, writable: true }); return true; } catch (e) { return false; }
  }
  function capped(promise, ms) {
    if (!realSetTimeout) return promise;
    return new Promise(function (resolve) {
      var done = false;
      var id = realSetTimeout(function () { if (!done) { done = true; resolve(false); } }, ms);
      Promise.resolve(promise).then(function () {
        if (!done) { done = true; if (realClearTimeout) realClearTimeout(id); resolve(true); }
      }, function () {
        if (!done) { done = true; if (realClearTimeout) realClearTimeout(id); resolve(true); }
      });
    });
  }

  // ---------------------------------------------------------------- random
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(SEED);
  var cryptoRand = mulberry32((SEED ^ 0x9E3779B9) >>> 0);
  if (W.Math) def(W.Math, "random", function random() { return rand(); });
  var cr = W.crypto;
  if (cr) {
    var getRandomValues = function getRandomValues(arr) {
      if (!arr || !ArrayBuffer.isView(arr)) throw new TypeError("getRandomValues: expected an integer TypedArray");
      var bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (var i = 0; i < bytes.length; i++) bytes[i] = (cryptoRand() * 256) | 0;
      return arr;
    };
    def(cr, "getRandomValues", getRandomValues);
    def(cr, "randomUUID", function randomUUID() {
      var b = getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var h = "";
      for (var i = 0; i < 16; i++) {
        h += (b[i] + 0x100).toString(16).slice(1);
        if (i === 3 || i === 5 || i === 7 || i === 9) h += "-";
      }
      return h;
    });
  }

  // ------------------------------------------------------------------ time
  function now() { return vt; }
  if (W.Performance && W.Performance.prototype) def(W.Performance.prototype, "now", now);
  if (perf) def(perf, "now", now);

  function VDate() {
    var args = Array.prototype.slice.call(arguments);
    if (!new.target) return new RealDate(EPOCH + vt).toString();
    if (args.length === 0) args = [EPOCH + vt];
    return Reflect.construct(RealDate, args, new.target);
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = function now() { return Math.floor(EPOCH + vt); };
  VDate.parse = RealDate.parse;
  VDate.UTC = RealDate.UTC;
  def(VDate, "name", "Date");
  def(VDate, "toString", function toString() { return "function Date() { [native code] }"; });
  def(RealDate.prototype, "constructor", VDate);
  W.Date = VDate;

  if (DOC && DOC.timeline) {
    try { Object.defineProperty(DOC.timeline, "currentTime", { get: now, configurable: true }); } catch (e) {}
  }

  // ------------------------------------------------------------------- rAF
  var rafQueue = [];
  var rafSeq = 0;
  W.requestAnimationFrame = function requestAnimationFrame(cb) {
    var id = ++rafSeq;
    rafQueue.push({ id: id, cb: cb });
    return id;
  };
  W.cancelAnimationFrame = function cancelAnimationFrame(id) {
    for (var i = 0; i < rafQueue.length; i++) {
      if (rafQueue[i].id === id) { rafQueue.splice(i, 1); return; }
    }
  };
  function flushRaf() {
    var q = rafQueue;
    rafQueue = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i].cb(vt); } catch (e) { report(e); }
    }
    return q.length;
  }

  // ---------------------------------------------------------------- timers
  var heap = [];
  var timers = {};
  var timerId = 0;
  var order = 0;
  function less(a, b) { return a.time < b.time || (a.time === b.time && a.order < b.order); }
  function hpush(e) {
    heap.push(e);
    var i = heap.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      var tmp = heap[i]; heap[i] = heap[p]; heap[p] = tmp; i = p;
    }
  }
  function hpop() {
    var top = heap[0];
    var last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        var tmp = heap[i]; heap[i] = heap[m]; heap[m] = tmp; i = m;
      }
    }
    return top;
  }
  function schedule(fn, delay, args, repeat) {
    if (typeof fn !== "function") {
      var code = String(fn);
      fn = function () { (0, eval)(code); };
    }
    delay = Number(delay);
    if (!(delay > 0)) delay = 0;
    var id = ++timerId;
    var e = { id: id, time: vt + delay, order: ++order, fn: fn, args: args, interval: repeat ? Math.max(1, delay) : 0, cancelled: false };
    timers[id] = e;
    hpush(e);
    return id;
  }
  function clearTimer(id) {
    var e = timers[id];
    if (e) { e.cancelled = true; delete timers[id]; }
  }
  W.setTimeout = function setTimeout(fn, delay) { return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), false); };
  W.setInterval = function setInterval(fn, delay) { return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), true); };
  W.clearTimeout = function clearTimeout(id) { clearTimer(id); };
  W.clearInterval = function clearInterval(id) { clearTimer(id); };
  W.requestIdleCallback = function requestIdleCallback(cb) {
    return schedule(function () { cb({ didTimeout: false, timeRemaining: function () { return 50; } }); }, 0, [], false);
  };
  W.cancelIdleCallback = function cancelIdleCallback(id) { clearTimer(id); };

  function runTimers(target) {
    var guard = 0;
    while (heap.length && heap[0].time <= target) {
      var e = hpop();
      if (e.cancelled) continue;
      if (++guard > 100000) { issues.push("timer storm: more than 100000 timers due before t=" + target / 1000 + "s"); break; }
      if (e.time > vt) vt = e.time;
      if (e.time > lastTimerAt) lastTimerAt = e.time;
      if (e.interval) { e.time += e.interval; e.order = ++order; hpush(e); }
      else delete timers[e.id];
      gsapUpdate();
      try { e.fn.apply(W, e.args); } catch (err) { report(err); }
      noteAnimations();
    }
  }

  // ------------------------------------------------------------------ GSAP
  var gsapRef;
  var tamed = [];
  function tameGsap(g) {
    if (!g || typeof g !== "object" && typeof g !== "function") return;
    if (!g.ticker) return;
    try { g.ticker.lagSmoothing(0); } catch (e) {}
    try { if (g.updateRoot) g.ticker.remove(g.updateRoot); } catch (e) {}
    if (tamed.indexOf(g) < 0) tamed.push(g);
  }
  try {
    Object.defineProperty(W, "gsap", {
      configurable: true,
      enumerable: true,
      get: function () { return gsapRef; },
      set: function (v) { gsapRef = v; tameGsap(v); },
    });
  } catch (e) {}
  function gsapUpdate() {
    var g = gsapRef;
    if (!g || typeof g.updateRoot !== "function") return;
    if (tamed.indexOf(g) < 0) tameGsap(g);
    try { g.updateRoot(vt / 1000); } catch (e) { report(e); }
  }

  // --------------------------------------------------------- window.__videly
  var meta;
  var hooks = [];
  function registerOnSeek(fn) {
    if (typeof fn !== "function") return function () {};
    hooks.push(fn);
    return function () { var i = hooks.indexOf(fn); if (i >= 0) hooks.splice(i, 1); };
  }
  try {
    Object.defineProperty(W, "__videly", {
      configurable: true,
      enumerable: true,
      get: function () { return meta; },
      set: function (v) {
        meta = v;
        if (v && typeof v === "object" && typeof v.onSeek !== "function") {
          try { v.onSeek = registerOnSeek; } catch (e) {}
        }
      },
    });
  } catch (e) {}
  function runHooks(t) {
    var list = hooks.slice();
    var own = meta && meta.onSeek;
    if (typeof own === "function" && own !== registerOnSeek) list.push(own);
    var pending = [];
    for (var i = 0; i < list.length; i++) {
      try {
        var r = list[i].call(meta, t);
        if (r && typeof r.then === "function") pending.push(r);
      } catch (e) { report(e); }
    }
    return pending;
  }
  function seekTimeline(t) {
    var tl = meta && meta.timeline;
    if (!tl || typeof tl.seek !== "function") return;
    try {
      if (typeof tl.paused === "function" && !tl.paused()) tl.pause();
      tl.seek(t, false);
    } catch (e) { report(e); }
  }

  // ----------------------------------------------------- CSS / WAAPI / SMIL
  var births = typeof WeakMap === "function" ? new WeakMap() : null;
  var tracked = [];
  function noteAnimations() {
    if (!DOC || typeof DOC.getAnimations !== "function" || !births) return;
    var list;
    try { list = DOC.getAnimations(); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (births.has(a)) continue;
      var rate = typeof a.playbackRate === "number" ? a.playbackRate : 1;
      var start = 0;
      if (rate < 0) {
        try { start = a.effect.getComputedTiming().endTime || 0; } catch (e) { start = 0; }
      }
      births.set(a, { at: vt, start: start, rate: rate });
      tracked.push(a);
      try { a.pause(); } catch (e) {}
    }
  }
  function seekAnimations() {
    noteAnimations();
    for (var i = tracked.length - 1; i >= 0; i--) {
      var a = tracked[i];
      if (a.playState === "idle") { tracked.splice(i, 1); continue; } // cancelled (e.g. class removed)
      var b = births.get(a);
      var ct = b.start + (vt - b.at) * b.rate;
      if (!(ct >= 0)) ct = 0;
      try {
        if (a.playState !== "paused") a.pause();
        a.currentTime = ct;
      } catch (e) {}
    }
  }
  function seekSmil(t) {
    if (!DOC || !DOC.querySelector) return;
    if (!DOC.querySelector("animate, animateTransform, animateMotion, set")) return;
    var svgs = DOC.querySelectorAll("svg");
    for (var i = 0; i < svgs.length; i++) {
      var s = svgs[i];
      if (s.ownerSVGElement) continue;
      try { s.pauseAnimations(); s.setCurrentTime(t); } catch (e) {}
    }
  }

  // ----------------------------------------------------------------- video
  function videoTime(v, t) {
    var start = parseFloat(v.getAttribute("data-start") || "0") || 0;
    var local = t - start;
    if (!(local > 0)) local = 0;
    var d = v.duration;
    if (isFinite(d) && d > 0) local = v.loop ? local % d : Math.min(local, Math.max(0, d - 0.001));
    return local;
  }
  function awaitSeek(v, time) {
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (done) return; done = true; v.removeEventListener("seeked", fin); resolve(); }
      v.addEventListener("seeked", fin);
      if (realSetTimeout) realSetTimeout(fin, 2000);
      try { v.currentTime = time; } catch (e) { fin(); }
    });
  }
  function seekVideos(t, loose) {
    if (!DOC || !DOC.querySelectorAll) return [];
    var vids = DOC.querySelectorAll("video");
    var pending = [];
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      var local = videoTime(v, t);
      if (loose) {
        // Preview playback: let the element play natively, correct drift only.
        if (v.paused) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
        if (Math.abs(v.currentTime - local) > 0.25) { try { v.currentTime = local; } catch (e) {} }
        continue;
      }
      if (MODE === "render") v.muted = true;
      if (!v.paused) { try { v.pause(); } catch (e) {} }
      if (v.readyState >= 1 && Math.abs(v.currentTime - local) > 0.0005) pending.push(awaitSeek(v, local));
    }
    return pending;
  }

  // ---------------------------------------------------------------- settle
  function settlePending() {
    var pending = [];
    if (DOC && DOC.fonts && DOC.fonts.status === "loading") pending.push(DOC.fonts.ready);
    if (DOC && DOC.images) {
      for (var i = 0; i < DOC.images.length; i++) {
        var img = DOC.images[i];
        if (img.src && !img.complete) pending.push(imgLoaded(img));
      }
    }
    return pending;
  }
  function imgLoaded(img) {
    return new Promise(function (resolve) {
      if (img.complete) { resolve(); return; }
      img.addEventListener("load", function () { resolve(); }, { once: true });
      img.addEventListener("error", function () { resolve(); }, { once: true });
    }).then(function () { return img.decode ? img.decode().catch(function () {}) : undefined; });
  }

  // ------------------------------------------------------------------ seek
  function seekSync(t) {
    var target = Math.max(0, Number(t) || 0) * 1000;
    runTimers(target);
    vt = target;
    gsapUpdate();
    seekTimeline(t);
    var pending = runHooks(t);
    if (flushRaf() > 0) gsapUpdate();
    seekAnimations();
    seekSmil(t);
    return pending;
  }
  function seek(t, opts) {
    t = Math.max(0, Number(t) || 0);
    var loose = !!(opts && opts.loose);
    var pending = seekSync(t).concat(seekVideos(t, loose));
    if (loose) return Promise.resolve(vt / 1000);
    var hookWait = pending.length ? capped(Promise.all(pending), 5000) : Promise.resolve(true);
    return hookWait.then(function () {
      var settle = settlePending();
      return settle.length ? capped(Promise.all(settle), 3000) : true;
    }).then(function () { return vt / 1000; });
  }

  // ----------------------------------------------------------------- ready
  function ready() {
    // Run anything scheduled for t=0 (setTimeout(fn, 0), the first rAF) so
    // content created there is included in the gates below.
    try { seekSync(0); } catch (e) { report(e); }
    var gates = [];
    function gate(name, p) {
      var entry = { name: name, done: false };
      gates.push(entry);
      return Promise.resolve(p).then(function () { entry.done = true; }, function () { entry.done = true; });
    }
    var all = [];
    if (DOC && DOC.fonts && DOC.fonts.ready) all.push(gate("fonts", DOC.fonts.ready));
    if (DOC && DOC.images) {
      for (var i = 0; i < DOC.images.length; i++) {
        var img = DOC.images[i];
        if (!img.getAttribute("src") && !img.getAttribute("srcset")) continue;
        all.push(gate("img " + (img.currentSrc || img.src).slice(0, 120), imgLoaded(img)));
      }
    }
    if (DOC && DOC.querySelectorAll) {
      var vids = DOC.querySelectorAll("video");
      for (var j = 0; j < vids.length; j++) {
        (function (v) {
          if (v.readyState >= 2) return;
          all.push(gate("video " + (v.currentSrc || v.src || "").slice(0, 120), new Promise(function (resolve) {
            v.addEventListener("loadeddata", function () { resolve(); }, { once: true });
            v.addEventListener("error", function () { resolve(); }, { once: true });
            try { if (v.preload === "none") v.preload = "auto"; if (v.readyState === 0) v.load(); } catch (e) {}
          })));
        })(vids[j]);
      }
    }
    if (meta && meta.ready && typeof meta.ready.then === "function") all.push(gate("__videly.ready", meta.ready));
    var started = realPerfNow();
    return capped(Promise.all(all), 15000).then(function (ok) {
      var timedOut = [];
      for (var k = 0; k < gates.length; k++) if (!gates[k].done) timedOut.push(gates[k].name);
      return seek(0).then(function () {
        return { ok: ok && timedOut.length === 0, timedOut: timedOut, waitedMs: Math.round(realPerfNow() - started) };
      });
    });
  }

  // --------------------------------------------------------------- preview
  var playing = false;
  var previewReady = false;
  function metaNumber(key) {
    var v = meta && Number(meta[key]);
    return isFinite(v) && v > 0 ? v : 0;
  }
  function post(msg) {
    try { if (W.parent && W.parent !== W) W.parent.postMessage(msg, "*"); } catch (e) {}
  }
  function postTime() { post({ type: "videly:time", time: vt / 1000, playing: playing }); }

  if (MODE === "preview") {
    var lastReal = 0;
    var lastPost = 0;
    var busy = false;
    var tick = function () {
      if (realRAF) realRAF(tick);
      if (!playing || busy || !previewReady) return;
      var nowReal = realPerfNow();
      var dt = Math.min(100, Math.max(0, nowReal - lastReal));
      lastReal = nowReal;
      var next = vt + dt;
      var dur = metaNumber("duration") * 1000;
      if (dur > 0 && next >= dur) next = next % dur; // loop (backward seek to ~0)
      busy = true;
      seek(next / 1000, { loose: true }).then(function () {
        busy = false;
        if (nowReal - lastPost > 66) { lastPost = nowReal; postTime(); }
      }, function () { busy = false; });
    };
    if (realRAF) realRAF(tick);

    W.addEventListener("message", function (ev) {
      if (ev.source && W.parent && ev.source !== W.parent) return;
      var d = ev.data;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      if (d.type === "videly:seek") {
        var dur = metaNumber("duration");
        var t = Math.max(0, Number(d.time) || 0);
        if (dur > 0) t = Math.min(t, dur);
        seek(t).then(postTime, postTime);
      } else if (d.type === "videly:play") {
        var dur2 = metaNumber("duration");
        if (dur2 > 0 && vt >= dur2 * 1000 - 1) seek(0);
        playing = true;
        lastReal = realPerfNow();
        postTime();
      } else if (d.type === "videly:pause") {
        playing = false;
        var vids = DOC ? DOC.querySelectorAll("video") : [];
        for (var i = 0; i < vids.length; i++) { try { vids[i].pause(); } catch (e) {} }
        seek(vt / 1000).then(postTime, postTime);
      }
    });
    W.addEventListener("error", function (ev) {
      post({ type: "videly:error", message: String((ev && (ev.message || (ev.error && ev.error.message))) || "Script error") });
    });
    W.addEventListener("unhandledrejection", function (ev) {
      var r = ev && ev.reason;
      post({ type: "videly:error", message: "Unhandled rejection: " + String((r && r.message) || r) });
    });
    var boot = function () {
      if (!meta || !metaNumber("duration")) {
        post({ type: "videly:error", message: "window.__videly = { duration, fps, width, height } is missing or invalid" });
      }
      ready().then(function () {
        previewReady = true;
        post({ type: "videly:ready", duration: metaNumber("duration"), width: metaNumber("width"), height: metaNumber("height") });
        postTime();
      }, function (e) {
        post({ type: "videly:error", message: String((e && e.message) || e) });
      });
    };
    if (DOC && DOC.readyState === "complete") realSetTimeout && realSetTimeout(boot, 0);
    else W.addEventListener("load", function () { boot(); });
  }

  var api = {
    version: 1,
    mode: MODE,
    seek: function (t) { return seek(t); },
    ready: ready,
    now: function () { return vt / 1000; },
    onSeek: registerOnSeek,
    state: function () {
      return { time: vt / 1000, lastTimerAt: lastTimerAt < 0 ? -1 : lastTimerAt / 1000, pendingTimers: heap.length, pendingRaf: rafQueue.length, animations: tracked.length, issues: issues.slice() };
    },
    play: function () { playing = true; lastReal = realPerfNow(); },
    pause: function () { playing = false; },
    // Resolve after n real browser frames (used by the renderer to let the
    // compositor finish re-rastering before a capture).
    waitFrames: function (n) {
      return new Promise(function (resolve) {
        var left = Math.max(1, n | 0);
        if (!realRAF) { resolve(); return; }
        var step = function () { if (--left <= 0) resolve(); else realRAF(step); };
        realRAF(step);
      });
    },
  };
  try { Object.defineProperty(W, "__videlyShim", { value: api, configurable: false, writable: false, enumerable: false }); }
  catch (e) { W.__videlyShim = api; }
})(window);
`;

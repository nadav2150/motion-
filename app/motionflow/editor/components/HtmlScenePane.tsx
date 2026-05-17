import { useEffect, useRef, useState } from "react";
import { injectPreviewFit } from "../shims";
import type { ShotRow } from "../types";

/**
 * Renders the film's HTML composition in an iframe. The iframe is a
 * *passive slave* of the editor's global clock — see sceneClockSlaveShim
 * in ../shims.ts. Per tick we post `{ type: "seek", seconds: globalTime }`
 * and the shim runs `tl.pause(); tl.time(seconds)`.
 *
 * composition.html holds ONE GSAP timeline spanning the WHOLE film
 * (verified empirically — `tl.duration()` equals the sum of all scene
 * durations). Every shot row points at the same composition file. Keying
 * the fetch and iframe off `scene_html_path` (not `shot.id`) means the
 * iframe persists across scene boundaries and GSAP scrubs smoothly along
 * the master timeline — no remount, no auto-replay from t=0 every scene
 * change.
 *
 * Fetched via /api/shots/:id/scene-html (which forces text/html) and
 * mounted via `srcDoc` so the browser executes the scene's JS.
 */
export const HtmlScenePane = ({
  shot,
  playing: _playing,
  time,
  startSeconds: _startSeconds,
}: {
  shot: ShotRow;
  /** Reserved — the iframe always follows the clock. Play/pause is driven
   *  by the parent; the iframe itself stays paused and only seeks. */
  playing: boolean;
  /** Global film time in seconds. */
  time: number;
  /** Reserved — composition.html holds the master timeline so we seek
   *  directly to `time`. Kept on the API so call sites don't churn. */
  startSeconds: number;
}) => {
  const [html, setHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeReady = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  // Cache key is the composition URL — falls back to shot.id only when
  // scene_html_path is missing (older rows pre-master-comp).
  const compKey = shot.scene_html_path ?? shot.id;

  useEffect(() => {
    setHtml(null);
    iframeReady.current = false;
    pendingSeek.current = null;
  }, [compKey]);

  // Fetch the composition HTML once per composition. The fetch URL still
  // uses shot.id because the API resolves it to whichever scene_html_path
  // is on that row — but since every row points at the same file, every
  // shot id yields the same bytes, so we only refetch when compKey
  // changes.
  useEffect(() => {
    let cancelled = false;
    const tag = `[composition ${compKey.slice(0, 24)}…]`;
    (async () => {
      try {
        const url = `/api/shots/${shot.id}/scene-html`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        setHtml(injectPreviewFit(text));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(tag, "load failed:", message);
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // shot.id is intentionally NOT a dep — only the composition identity is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compKey]);

  // Receive the iframe's "ready" handshake so we know it has installed the
  // postMessage listener. Until then we stash the latest time in
  // pendingSeek and flush it on ready.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __mgClock?: boolean; type?: string } | null;
      if (!d || !d.__mgClock) return;
      if (d.type === "ready") {
        iframeReady.current = true;
        const w = iframeRef.current?.contentWindow;
        const latest = pendingSeek.current;
        if (w && latest != null) {
          w.postMessage(
            { __mgClock: true, type: "seek", seconds: latest },
            "*",
          );
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Push every clock tick into the iframe. We send GLOBAL seconds because
  // composition.html holds one master timeline spanning the whole film.
  // The shim is idempotent so duplicate seeks are harmless.
  useEffect(() => {
    pendingSeek.current = time;
    const w = iframeRef.current?.contentWindow;
    if (!w || !iframeReady.current) return;
    w.postMessage({ __mgClock: true, type: "seek", seconds: time }, "*");
  }, [time, html]);

  if (!html) {
    if (shot.scene_thumbnail_path) {
      return (
        <img
          src={shot.scene_thumbnail_path}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#050505",
          }}
        />
      );
    }
    return null;
  }

  return (
    <iframe
      ref={iframeRef}
      key={compKey}
      srcDoc={html}
      title="Film composition"
      sandbox="allow-scripts"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        background: "#050505",
        pointerEvents: "none",
      }}
    />
  );
};

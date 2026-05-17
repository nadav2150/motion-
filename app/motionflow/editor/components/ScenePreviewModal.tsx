import { useEffect, useRef, useState } from "react";
import { injectPreviewFit } from "../shims";
import type { ShotRow } from "../types";

// Scene HTML is authored against a fixed 1920×1080 stage (see emit.ts and
// the llm-director spec). HyperFrames renders it at a true 1920×1080
// viewport, but the preview iframe is much smaller, so without scaling the
// stage overflows.
//
// Strategy: force html/body to fill the iframe viewport, flex-center #root,
// then visually scale only #root by min(viewportW/1920, viewportH/1080).
// We DO NOT touch the body or #root's layout dimensions — that keeps GSAP's
// tweens against #root children running against the same 1920×1080 space the
// scene was authored in (no positioning math goes off the rails).
//
// Anything outside the scaled #root falls back to the body's #050505
// background → natural letterbox / pillarbox if the iframe's aspect ratio
// doesn't match 16:9.
//
// `!important` is required because composition.html declares
// `html, body { width: 1920px; height: 1080px; background: var(--bg) }`
// at equal specificity earlier in <head>.
// Bulletproof preview-fit: position #root absolutely at the iframe's
// dead-center, then transform: translate(-50%, -50%) scale(s) where
// s = min(viewportW/1920, viewportH/1080). Centering doesn't depend on
// flex/grid alignment cooperating with the composition's own CSS — the
export const ScenePreviewModal = ({
  shot,
  sceneStartSeconds = 0,
  filmTotalSeconds,
  onClose,
}: {
  shot: ShotRow;
  /** Scene start time on the master film timeline (single-composition era). */
  sceneStartSeconds?: number;
  /** Total film duration (sum of all scenes), so we can clamp seek + show context. */
  filmTotalSeconds?: number;
  onClose: () => void;
}) => {
  const [playKey, setPlayKey] = useState<number | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeReady = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Relay every console / error / rejection event from the scene iframe into
  // this window's console so all scene-debug output lands in one DevTools.
  useEffect(() => {
    const tag = `[scene ${shot.shot_index + 1} · ${shot.id.slice(0, 8)}]`;
    const handler = (e: MessageEvent) => {
      const d = e.data as { __mgScene?: boolean; level?: string; args?: string[] } | null;
      if (!d || !d.__mgScene) return;
      const level = (d.level ?? "log") as "log" | "info" | "warn" | "error" | "debug";
      const fn = (console[level] ?? console.log).bind(console);
      fn(tag, ...(d.args ?? []));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [shot.id, shot.shot_index]);

  // When the rendered film is available, seek it to this scene's start every
  // time the modal opens for a different shot.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => {
      v.currentTime = sceneStartSeconds;
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [sceneStartSeconds, shot.rendered_video_url]);

  // Local rAF loop that drives the iframe's scene-local GSAP timeline.
  // composition.html holds a `gsap.timeline({ paused: true })` whose t=0 is
  // the scene's start (see emit.ts) — so the shim wants scene-LOCAL seconds.
  // We loop 0..duration to give the modal an in-place scene preview.
  useEffect(() => {
    if (playKey == null || !html) return;
    iframeReady.current = false;
    const duration = Number(shot.duration) || 0;
    let raf = 0;
    let t0 = performance.now();
    const tick = (now: number) => {
      let seconds = (now - t0) / 1000;
      if (duration > 0 && seconds >= duration) {
        t0 = now;
        seconds = 0;
      }
      const w = iframeRef.current?.contentWindow;
      if (w && iframeReady.current) {
        w.postMessage({ __mgClock: true, type: "seek", seconds }, "*");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playKey, html, shot.duration]);

  // Listen for the iframe's ready handshake so we know the seek listener is
  // installed. Same protocol as HtmlScenePane.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __mgClock?: boolean; type?: string } | null;
      if (!d || !d.__mgClock) return;
      if (d.type === "ready") iframeReady.current = true;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const hasVideo = !!shot.rendered_video_url;
  const hasHtml = !!shot.scene_html_path;
  const playing = playKey !== null;

  const handlePlay = async () => {
    const tag = `[scene ${shot.shot_index + 1} · ${shot.id.slice(0, 8)}]`;
    console.log(
      tag,
      "play clicked — sceneStart=",
      sceneStartSeconds,
      "s · duration=",
      Number(shot.duration) || 0,
      "s · htmlPath=",
      shot.scene_html_path,
    );
    setPlayKey((k) => (k ?? 0) + 1);
    if (!shot.scene_html_path) {
      console.warn(tag, "no scene_html_path on this shot — nothing to load");
      return;
    }
    setLoadStatus("loading");
    setLoadError(null);
    const t0 = performance.now();
    try {
      // Route handles both public-URL and legacy storage-path values and
      // always returns text/html, sidestepping Supabase Content-Type quirks.
      const url = `/api/shots/${shot.id}/scene-html`;
      console.log(tag, "GET", url);
      const res = await fetch(url);
      console.log(tag, "response", res.status, res.statusText, `${Math.round(performance.now() - t0)}ms`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const text = await res.text();
      console.log(tag, "html size", text.length, "chars · injecting shims + mounting iframe");
      setHtml(
        injectPreviewFit(text, {
          startSeconds: sceneStartSeconds,
          durationSeconds: Number(shot.duration) || 0,
        }),
      );
      setLoadStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(tag, "load failed:", message);
      setLoadError(message);
      setLoadStatus("error");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(3,4,8,0.78)",
        backdropFilter: "blur(10px)",
        display: "grid", placeItems: "center",
        padding: 28,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1200px, 92vw)",
          maxHeight: "92vh",
          background: "rgba(8,9,13,0.96)",
          border: "1px solid rgba(122,162,255,0.30)",
          borderRadius: 16,
          boxShadow: "0 40px 120px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px",
          borderBottom: "1px solid var(--line)",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--ink-3)" }}>
              SCENE {String(shot.shot_index + 1).padStart(2, "0")} · {Number(shot.duration).toFixed(1).replace(/\.0$/, "")}s
            </span>
            {shot.shot_goal && (
              <span style={{
                fontSize: 13, color: "var(--ink-1)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {shot.shot_goal}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--ink-2)",
              fontFamily: "inherit", fontSize: 12, cursor: "pointer",
            }}
          >
            Close · Esc
          </button>
        </div>

        <div style={{
          position: "relative",
          aspectRatio: "16/9",
          background: "#050505",
          overflow: "hidden",
        }}>
          {hasVideo ? (
            <video
              ref={videoRef}
              key={shot.rendered_video_url ?? "no-video"}
              src={shot.rendered_video_url ?? undefined}
              autoPlay
              loop
              controls
              playsInline
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                background: "#050505",
                objectFit: "contain",
              }}
            />
          ) : playing && html ? (
            <iframe
              ref={iframeRef}
              key={playKey}
              srcDoc={html}
              title={`Scene ${shot.shot_index + 1} preview`}
              sandbox="allow-scripts"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                border: "none", background: "#050505",
              }}
            />
          ) : playing && loadStatus === "loading" ? (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              color: "var(--ink-3)", fontSize: 12,
            }}>
              Loading scene…
            </div>
          ) : shot.scene_thumbnail_path ? (
            <img
              src={shot.scene_thumbnail_path}
              alt={`Scene ${shot.shot_index + 1} thumbnail`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#050505" }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              color: "var(--ink-3)", fontSize: 12,
            }}>
              No preview available yet.
            </div>
          )}

          {hasHtml && (
            <button
              onClick={handlePlay}
              style={{
                position: "absolute",
                bottom: 16, left: "50%", transform: "translateX(-50%)",
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 999,
                border: "1px solid rgba(167,139,250,0.55)",
                background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
                color: "#0B0C10",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 10px 30px -8px rgba(122,162,255,0.55)",
              }}
            >
              <span style={{
                width: 0, height: 0,
                borderLeft: "9px solid #0B0C10",
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                marginLeft: 2,
              }} />
              {playing ? "Replay" : "Play scene"}
            </button>
          )}
        </div>

        {loadError && (
          <div style={{
            padding: "10px 18px",
            borderTop: "1px solid rgba(255,80,80,0.25)",
            background: "rgba(255,80,80,0.06)",
            fontSize: 12, color: "#FF8A8A",
          }}>
            Could not load scene HTML: {loadError}
          </div>
        )}

        {shot.narration_part && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
            <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--ink-4)", marginRight: 10 }}>BEAT</span>
            {shot.narration_part}
          </div>
        )}
      </div>
    </div>
  );
};

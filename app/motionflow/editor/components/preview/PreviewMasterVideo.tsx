import { useEffect, useRef } from "react";

/**
 * The inline preview video. Slaved to the global clock — `currentTime` is
 * driven by `time` (seconds on the assembled film), `play()/pause()` by
 * `playing`. Same model as music/sfx/vo: we never trust the media element
 * as a clock source; it follows global time.
 *
 * `rendered_video_url` on every shot row points at the same master MP4
 * (hyperframes writes one file for all scenes — see jobs.ts
 * runHyperframesExport). Re-using a single <video> element across scene
 * changes is correct: when the active scene changes, the global clock
 * doesn't reset, so the video keeps playing and we just continue seeking
 * it to `time`.
 */
const SYNC_TOLERANCE = 0.1;

export const PreviewMasterVideo = ({
  src,
  time,
  playing,
  poster,
}: {
  src: string;
  time: number;
  playing: boolean;
  poster?: string | null;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - time) > SYNC_TOLERANCE) {
      try {
        v.currentTime = time;
      } catch {}
    }
  }, [time, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {
            // Autoplay policy can block — once the user clicks play (which
            // requires a gesture), this resolves. Nothing to do here.
          });
        }
      }
    } else if (!v.paused) {
      v.pause();
    }
  }, [playing, src]);

  return (
    <video
      ref={videoRef}
      key={src}
      src={src}
      poster={poster ?? undefined}
      muted
      playsInline
      preload="auto"
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
};

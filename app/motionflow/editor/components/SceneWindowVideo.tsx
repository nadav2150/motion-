import { useEffect, useRef } from "react";

/**
 * Plays only the [start, start+duration] slice of a master film MP4 and loops
 * within that window. The hyperframes export writes the same master URL onto
 * every shot row, so without this each scene tile would autoplay the full
 * film — see jobs.ts runHyperframesExport.
 */
export const SceneWindowVideo = ({
  src,
  startSeconds,
  durationSeconds,
  poster,
}: {
  src: string;
  startSeconds: number;
  durationSeconds: number;
  poster?: string;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const start = Math.max(0, startSeconds);
  const end = durationSeconds > 0 ? start + durationSeconds : null;

  // Media Fragments URI gives most browsers a hint on initial decode; the
  // timeupdate handler below is what actually enforces the loop window.
  const fragmentedSrc = end != null ? `${src}#t=${start},${end}` : `${src}#t=${start}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seekStart = () => {
      try {
        v.currentTime = start;
      } catch {}
    };
    const onTime = () => {
      if (end != null && v.currentTime >= end - 0.05) {
        seekStart();
        void v.play().catch(() => {});
      }
    };
    if (v.readyState >= 1) seekStart();
    else v.addEventListener("loadedmetadata", seekStart, { once: true });
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", seekStart);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [src, start, end]);

  return (
    <video
      ref={videoRef}
      key={fragmentedSrc}
      src={fragmentedSrc}
      poster={poster}
      autoPlay
      muted
      playsInline
      preload="metadata"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#050505" }}
    />
  );
};

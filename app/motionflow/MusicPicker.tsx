import { useEffect, useRef, useState } from "react";
import { IconClose, IconMusic, IconPause, IconPlay, IconPlus } from "./primitives";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  streamUrl: string;
  artworkUrl: string | null;
  tags: string[];
};

export type CurrentMusic = {
  trackId: string;
  title: string;
  artist: string;
  streamUrl: string;
};

type Props = {
  jobId: string;
  current: CurrentMusic | null;
  onChange?: (next: CurrentMusic | null) => void;
  /**
   * Called when the user confirms "use as background music for the whole
   * project". The parent attaches the track to every scene's assets list
   * (kind: "music") so the AUDIO timeline shows it across the whole film.
   * If omitted, the prompt is skipped and only the job-level attach happens.
   */
  onApplyAsBackground?: (track: MusicTrack) => Promise<void>;
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MusicPicker({ jobId, current, onChange, onApplyAsBackground }: Props) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attached, setAttached] = useState<CurrentMusic | null>(current);
  const [removing, setRemoving] = useState(false);
  // When the user clicks "Add", we stage the track here and show an inline
  // confirmation asking whether to also apply it as project-wide background
  // music (i.e. attach to every scene's audio track).
  const [confirming, setConfirming] = useState<MusicTrack | null>(null);
  const [applying, setApplying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setAttached(current);
  }, [current?.trackId]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTracks([]);
      setSearchError(null);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setSearchError(null);
      fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`)
        .then(async (res) => {
          const body = await res.json();
          if (reqId !== reqIdRef.current) return;
          if (!res.ok) {
            throw new Error(body?.error ?? `Search failed (${res.status})`);
          }
          setTracks(Array.isArray(body?.tracks) ? body.tracks : []);
        })
        .catch((err) => {
          if (reqId !== reqIdRef.current) return;
          setTracks([]);
          setSearchError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (reqId === reqIdRef.current) setLoading(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  function togglePreview(track: { id: string; streamUrl: string }) {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === track.id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    a.src = track.streamUrl;
    a.currentTime = 0;
    void a.play().then(() => setPlayingId(track.id)).catch(() => setPlayingId(null));
  }

  async function remove() {
    if (!attached) return;
    setRemoving(true);
    setAttachError(null);
    const a = audioRef.current;
    if (a && playingId === `attached:${attached.trackId}`) {
      a.pause();
      setPlayingId(null);
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}/music`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Remove failed (${res.status})`);
      setAttached(null);
      onChange?.(null);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }

  // Step 1: the user clicks "Add" — we stage the track and ask whether to
  // also apply it as project-wide background music.
  function requestAttach(track: MusicTrack) {
    setAttachError(null);
    setConfirming(track);
  }

  // Step 2: commit the attach (job-level), and optionally bulk-add to every
  // scene as kind="music" via the parent callback.
  async function confirmAttach(applyAsBackground: boolean) {
    const track = confirming;
    if (!track) return;
    setAttaching(track.id);
    setApplying(applyAsBackground);
    setAttachError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          streamUrl: track.streamUrl,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);
      const next: CurrentMusic = {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        streamUrl: track.streamUrl,
      };
      setAttached(next);
      onChange?.(next);
      if (applyAsBackground && onApplyAsBackground) {
        await onApplyAsBackground(track);
      }
      setConfirming(null);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(null);
      setApplying(false);
    }
  }

  const inputStyle = {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid var(--line)",
    color: "var(--ink-1)",
    fontFamily: "inherit",
    fontSize: 12,
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} preload="none" />

      {attached && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderRadius: 10,
            background: "rgba(122,162,255,0.08)",
            border: "1px solid rgba(122,162,255,0.30)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: "rgba(122,162,255,0.16)",
              border: "1px solid var(--line)",
              color: "var(--ink-1)",
              flexShrink: 0,
            }}
          >
            <IconMusic size={14} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attached.title}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 11,
                color: "var(--ink-3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attached.artist}
            </div>
          </div>
          <button
            onClick={() =>
              togglePreview({ id: `attached:${attached.trackId}`, streamUrl: attached.streamUrl })
            }
            aria-label={playingId === `attached:${attached.trackId}` ? "Pause" : "Play"}
            disabled={removing}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--ink-1)",
              cursor: removing ? "not-allowed" : "pointer",
              padding: 0,
              opacity: removing ? 0.55 : 1,
            }}
          >
            {playingId === `attached:${attached.trackId}` ? (
              <IconPause size={12} />
            ) : (
              <IconPlay size={12} />
            )}
          </button>
          <button
            onClick={() => void remove()}
            disabled={removing}
            aria-label="Remove music"
            title="Remove music"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--ink-3)",
              cursor: removing ? "wait" : "pointer",
              padding: 0,
              opacity: removing ? 0.55 : 1,
            }}
          >
            <IconClose size={12} />
          </button>
        </div>
      )}

      <div>
        <div
          className="mf-mono"
          style={{
            fontSize: 10,
            color: "var(--ink-3)",
            letterSpacing: "0.12em",
            marginBottom: 8,
          }}
        >
          SEARCH
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="lofi, cinematic, ambient…"
            style={inputStyle}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              title="Clear"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--ink-3)",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <IconClose size={12} />
            </button>
          )}
        </div>
      </div>

      {searchError && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(255,107,107,0.08)",
            border: "1px solid rgba(255,107,107,0.30)",
            color: "#FCA5A5",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {searchError}
        </div>
      )}

      {!searchError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 320,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
          {loading && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 4px" }}>
              Searching…
            </div>
          )}
          {!loading && tracks.length === 0 && query.trim().length >= 2 && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 4px" }}>
              No tracks found for "{query.trim()}".
            </div>
          )}
          {!loading && tracks.length === 0 && query.trim().length < 2 && !attached && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 4px" }}>
              Type at least 2 characters to search Jamendo.
            </div>
          )}
          {tracks.map((track) => {
            const isPlaying = playingId === track.id;
            const isAttached = attached?.trackId === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 8,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.20)",
                  border: "1px solid var(--line)",
                }}
              >
                <button
                  onClick={() => togglePreview(track)}
                  aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    background: track.artworkUrl
                      ? `url(${track.artworkUrl}) center/cover, rgba(255,255,255,0.04)`
                      : "rgba(255,255,255,0.04)",
                    border: "1px solid var(--line)",
                    color: "#fff",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 7,
                      background: "rgba(0,0,0,0.45)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
                  </span>
                </button>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.title}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: "var(--ink-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.artist} · {formatDuration(track.durationSec)}
                  </div>
                </div>
                <button
                  onClick={() => requestAttach(track)}
                  disabled={attaching === track.id || isAttached}
                  title={isAttached ? "Already attached" : "Add to project"}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: isAttached
                      ? "rgba(122,162,255,0.10)"
                      : "rgba(122,162,255,0.16)",
                    border: "1px solid rgba(122,162,255,0.45)",
                    color: "var(--ink-1)",
                    fontFamily: "inherit",
                    fontSize: 11,
                    cursor: attaching === track.id ? "wait" : isAttached ? "default" : "pointer",
                    opacity: attaching === track.id || isAttached ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <IconPlus size={11} />
                  {isAttached ? "Added" : attaching === track.id ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {attachError && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(255,107,107,0.08)",
            border: "1px solid rgba(255,107,107,0.30)",
            color: "#FCA5A5",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {attachError}
        </div>
      )}

      {confirming && (
        <div
          onClick={() => {
            if (attaching) return;
            setConfirming(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(3,4,8,0.78)",
            backdropFilter: "blur(10px)",
            display: "grid",
            placeItems: "center",
            padding: 28,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(440px, 92vw)",
              background: "rgba(8,9,13,0.96)",
              border: "1px solid rgba(122,162,255,0.30)",
              borderRadius: 14,
              boxShadow:
                "0 40px 120px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
              padding: "20px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              className="mf-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "var(--ink-3)",
              }}
            >
              ADD MUSIC
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-1)", lineHeight: 1.5 }}>
              Use <span style={{ fontWeight: 600 }}>{confirming.title}</span>{" "}
              by {confirming.artist} as background music for the whole project?
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                lineHeight: 1.5,
              }}
            >
              When set as background, the track will play across all scenes on
              the AUDIO timeline. You can also just attach it to the project
              and arrange it manually.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 4,
              }}
            >
              <button
                onClick={() => void confirmAttach(true)}
                disabled={attaching !== null}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background:
                    "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
                  border: "1px solid rgba(167,139,250,0.55)",
                  color: "#0B0C10",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: attaching !== null ? "wait" : "pointer",
                  opacity: attaching !== null ? 0.75 : 1,
                }}
              >
                {applying ? "Applying to all scenes…" : "Yes, use as background music"}
              </button>
              <button
                onClick={() => void confirmAttach(false)}
                disabled={attaching !== null}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--line)",
                  color: "var(--ink-1)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: attaching !== null ? "wait" : "pointer",
                  opacity: attaching !== null ? 0.75 : 1,
                }}
              >
                {attaching && !applying ? "Adding…" : "Just attach to project"}
              </button>
              <button
                onClick={() => setConfirming(null)}
                disabled={attaching !== null}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  color: "var(--ink-3)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: attaching !== null ? "wait" : "pointer",
                  opacity: attaching !== null ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

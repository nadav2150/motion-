import { useEffect, useRef, useState } from "react";
import { IconClose, IconPause, IconPlay, IconPlus, IconWave } from "./primitives";

type Sfx = {
  id: string;
  name: string;
  author: string;
  durationSec: number;
  previewUrl: string;
  license: "cc0" | "cc-by";
  licenseUrl: string;
  tags: string[];
};

export type CurrentSfx = {
  sfxId: string;
  name: string;
  author: string;
  previewUrl: string;
  license: string;
};

type Props = {
  jobId: string;
  current: CurrentSfx | null;
  onChange?: (next: CurrentSfx | null) => void;
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SfxPicker({ jobId, current, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Sfx[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attached, setAttached] = useState<CurrentSfx | null>(current);
  const [removing, setRemoving] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setAttached(current);
  }, [current?.sfxId]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setSearchError(null);
      fetch(`/api/sfx/search?q=${encodeURIComponent(trimmed)}`)
        .then(async (res) => {
          const body = await res.json();
          if (reqId !== reqIdRef.current) return;
          if (!res.ok) {
            throw new Error(body?.error ?? `Search failed (${res.status})`);
          }
          setResults(Array.isArray(body?.sfx) ? body.sfx : []);
        })
        .catch((err) => {
          if (reqId !== reqIdRef.current) return;
          setResults([]);
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

  function togglePreview(sound: { id: string; previewUrl: string }) {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === sound.id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    a.src = sound.previewUrl;
    a.currentTime = 0;
    void a.play().then(() => setPlayingId(sound.id)).catch(() => setPlayingId(null));
  }

  async function remove() {
    if (!attached) return;
    setRemoving(true);
    setAttachError(null);
    const a = audioRef.current;
    if (a && playingId === `attached:${attached.sfxId}`) {
      a.pause();
      setPlayingId(null);
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}/sfx`, { method: "DELETE" });
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

  async function attach(sound: Sfx) {
    setAttaching(sound.id);
    setAttachError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/sfx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sfxId: sound.id,
          name: sound.name,
          author: sound.author,
          previewUrl: sound.previewUrl,
          license: sound.license,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Save failed (${res.status})`);
      const next: CurrentSfx = {
        sfxId: sound.id,
        name: sound.name,
        author: sound.author,
        previewUrl: sound.previewUrl,
        license: sound.license,
      };
      setAttached(next);
      onChange?.(next);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : String(err));
    } finally {
      setAttaching(null);
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
            background: "rgba(103,232,249,0.08)",
            border: "1px solid rgba(103,232,249,0.30)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: "rgba(103,232,249,0.16)",
              border: "1px solid var(--line)",
              color: "var(--ink-1)",
              flexShrink: 0,
            }}
          >
            <IconWave size={14} />
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
              {attached.name}
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
              {attached.author}
            </div>
          </div>
          <button
            onClick={() =>
              togglePreview({ id: `attached:${attached.sfxId}`, previewUrl: attached.previewUrl })
            }
            aria-label={playingId === `attached:${attached.sfxId}` ? "Pause" : "Play"}
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
            {playingId === `attached:${attached.sfxId}` ? (
              <IconPause size={12} />
            ) : (
              <IconPlay size={12} />
            )}
          </button>
          <button
            onClick={() => void remove()}
            disabled={removing}
            aria-label="Remove SFX"
            title="Remove SFX"
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
          SEARCH · CC0 + CC-BY ONLY
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="whoosh, click, impact…"
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
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 4px" }}>
              No CC0/CC-BY sounds found for "{query.trim()}".
            </div>
          )}
          {!loading && results.length === 0 && query.trim().length < 2 && !attached && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 4px" }}>
              Type at least 2 characters to search Freesound.
            </div>
          )}
          {results.map((sound) => {
            const isPlaying = playingId === sound.id;
            const isAttached = attached?.sfxId === sound.id;
            return (
              <div
                key={sound.id}
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
                  onClick={() => togglePreview(sound)}
                  aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--line)",
                    color: "var(--ink-1)",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
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
                    {sound.name}
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
                    {sound.author} · {formatDuration(sound.durationSec)}
                  </div>
                </div>
                <button
                  onClick={() => void attach(sound)}
                  disabled={attaching === sound.id || isAttached}
                  title={isAttached ? "Already attached" : "Add to project"}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: isAttached
                      ? "rgba(103,232,249,0.10)"
                      : "rgba(103,232,249,0.16)",
                    border: "1px solid rgba(103,232,249,0.45)",
                    color: "var(--ink-1)",
                    fontFamily: "inherit",
                    fontSize: 11,
                    cursor: attaching === sound.id ? "wait" : isAttached ? "default" : "pointer",
                    opacity: attaching === sound.id || isAttached ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <IconPlus size={11} />
                  {isAttached ? "Added" : attaching === sound.id ? "Adding…" : "Add"}
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
    </div>
  );
}

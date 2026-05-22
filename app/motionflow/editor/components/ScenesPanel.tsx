import { useMemo, useState, type ReactNode } from "react";
import { IconArrowRight, IconClose, IconLogo } from "../../primitives";
import { ASSET_KINDS } from "../constants";
import {
  isSceneAssetArray,
  isSceneCommentArray,
  readDraggedAsset,
  relativeTimeShort,
} from "../utils";
import type {
  JobAsset,
  SceneAsset,
  SceneAssetKind,
  SceneComment,
  ScenesPanelTab,
  ShotRow,
} from "../types";

// Right-side comments panel — per-scene threads persisted via
// PATCH /api/shots/:id/comments (jsonb column on shots, see migration
// 20260518_shot_comments.sql).

const ScenesAssetsTab = ({
  shot,
  onAssetsChanged,
}: {
  shot: ShotRow;
  onAssetsChanged?: (shotId: string, assets: SceneAsset[]) => void;
}) => {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo<SceneAsset[]>(
    () => (isSceneAssetArray(shot.assets) ? shot.assets : []),
    [shot],
  );

  const removeAsset = async (assetId: string) => {
    if (!onAssetsChanged) return;
    setRemovingId(assetId);
    setError(null);
    try {
      const res = await fetch(
        `/api/shots/${shot.id}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        assets?: unknown;
        error?: string;
      };
      if (!res.ok || !isSceneAssetArray(data.assets)) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onAssetsChanged(shot.id, data.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  };
  const byKind = useMemo(() => {
    const m = new Map<SceneAssetKind, SceneAsset[]>();
    for (const a of assets) {
      const arr = m.get(a.kind) ?? [];
      arr.push(a);
      m.set(a.kind, arr);
    }
    return m;
  }, [assets]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ASSET_KINDS.map(({ id, label }) => {
        const items = byKind.get(id) ?? [];
        return (
          <div key={id}>
            <div
              className="mf-mono"
              style={{
                fontSize: 10,
                color: "var(--ink-3)",
                letterSpacing: "0.12em",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{label}</span>
              {items.length > 0 && (
                <span style={{ color: "var(--ink-4)" }}>
                  {items.length} {items.length === 1 ? "ITEM" : "ITEMS"}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div
                style={{
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: "1px dashed var(--line-2)",
                  background: "rgba(255,255,255,0.015)",
                  color: "var(--ink-4)",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                Drop {label.toLowerCase()} here, or pick from the library on the left.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((a) => {
                  const isRemoving = removingId === a.id;
                  return (
                    <div
                      key={a.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: isRemoving ? 0.55 : 1,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 12,
                          color: "var(--ink-1)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.name || a.url.split("/").pop() || "asset"}
                      </span>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mf-mono"
                        style={{
                          fontSize: 10,
                          color: "var(--ink-3)",
                          letterSpacing: "0.1em",
                          textDecoration: "none",
                        }}
                      >
                        OPEN
                      </a>
                      <button
                        onClick={() => void removeAsset(a.id)}
                        disabled={isRemoving}
                        aria-label={`Remove ${a.name}`}
                        title="Remove from scene"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          display: "grid",
                          placeItems: "center",
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--ink-3)",
                          cursor: isRemoving ? "wait" : "pointer",
                          padding: 0,
                        }}
                      >
                        <IconClose size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>
          Failed to remove: {error}
        </div>
      )}
    </div>
  );
};

export const ScenesPanel = ({
  shot,
  onShotPatched,
  onAssetDrop,
  onAssetsChanged,
  commentsLocked = false,
  onUpsell,
  actions,
}: {
  shot: ShotRow | null;
  onShotPatched: (patch: { id: string; comments: SceneComment[] }) => void;
  onAssetDrop?: (
    shotId: string,
    trackKind: "video" | "motion" | "text" | "audio",
    asset: JobAsset,
  ) => void;
  onAssetsChanged?: (shotId: string, assets: SceneAsset[]) => void;
  commentsLocked?: boolean;
  onUpsell?: () => void;
  // Job-level action buttons rendered above the scene tabs. Built by the
  // editor screen since the gating logic depends on status + plan + comment
  // counts that live there.
  actions?: ReactNode;
}) => {
  const [tab, setTab] = useState<ScenesPanelTab>("comments");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const comments = useMemo<SceneComment[]>(() => {
    if (!shot) return [];
    return isSceneCommentArray(shot.comments) ? shot.comments : [];
  }, [shot]);

  const submit = async () => {
    if (!shot) return;
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/shots/${shot.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        comments?: SceneComment[];
        error?: string;
      };
      if (!res.ok || !data.comments) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onShotPatched({ id: shot.id, comments: data.comments });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!shot) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/shots/${shot.id}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        comments?: SceneComment[];
        error?: string;
      };
      if (!res.ok || !data.comments) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onShotPatched({ id: shot.id, comments: data.comments });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside
      onDragOver={(e) => {
        if (!shot || !onAssetDrop) return;
        if (
          Array.from(e.dataTransfer.types).includes("application/x-mg-asset")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Fire only when leaving the aside itself, not crossing into a child.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!shot || !onAssetDrop) return;
        const asset = readDraggedAsset(e);
        if (!asset) return;
        onAssetDrop(shot.id, "video", asset);
        setTab("assets");
      }}
      style={{
        borderLeft: "1px solid var(--line)",
        padding: "20px 18px",
        overflow: "auto",
        background: dragOver
          ? "rgba(122,162,255,0.06)"
          : "rgba(8,9,13,0.4)",
        outline: dragOver ? "1px dashed rgba(122,162,255,0.55)" : "none",
        outlineOffset: -1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition: "background 120ms",
      }}
    >
      {actions && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingBottom: 14,
            borderBottom: "1px solid var(--line)",
          }}
        >
          {actions}
        </div>
      )}

      <div
        className="mf-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          color: "var(--ink-3)",
        }}
      >
        {shot
          ? `SCENE ${String(shot.shot_index + 1).padStart(2, "0")}`
          : "SCENE"}
      </div>

      {/* Tab switcher */}
      <div
        role="tablist"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "rgba(0,0,0,0.25)",
          border: "1px solid var(--line)",
        }}
      >
        {(["assets", "comments"] as const).map((id) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              style={{
                padding: "7px 10px",
                borderRadius: 7,
                background: active ? "rgba(122,162,255,0.16)" : "transparent",
                border: `1px solid ${active ? "rgba(122,162,255,0.45)" : "transparent"}`,
                color: active ? "var(--ink-1)" : "var(--ink-3)",
                fontFamily: "inherit",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.04em",
                textTransform: "capitalize",
              }}
            >
              {id}
            </button>
          );
        })}
      </div>

      {!shot ? (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 12,
            border: "1px dashed var(--line-2)",
            background: "rgba(255,255,255,0.015)",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          Click a scene in the timeline to see its assets and leave notes.
        </div>
      ) : tab === "assets" ? (
        <ScenesAssetsTab shot={shot} onAssetsChanged={onAssetsChanged} />
      ) : commentsLocked ? (
        <div
          style={{
            position: "relative",
            padding: "26px 20px 22px",
            borderRadius: 14,
            border: "1px solid rgba(122,162,255,0.22)",
            background:
              "linear-gradient(180deg, rgba(122,162,255,0.06) 0%, rgba(167,139,250,0.04) 60%, rgba(8,9,13,0.4) 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 14,
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -60,
              left: "50%",
              transform: "translateX(-50%)",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(122,162,255,0.22), transparent 65%)",
              filter: "blur(28px)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: 56,
              height: 56,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background:
                "linear-gradient(180deg, rgba(122,162,255,0.18), rgba(167,139,250,0.10))",
              border: "1px solid rgba(122,162,255,0.35)",
              boxShadow:
                "0 8px 28px -8px rgba(122,162,255,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <IconLogo size={30} />
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "var(--ink-1)",
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
              }}
            >
              Comments are a{" "}
              <span
                style={{
                  background:
                    "linear-gradient(90deg, #7AA2FF, #A78BFA, #67E8F9)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Videly
              </span>{" "}
              paid feature
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--ink-3)",
                maxWidth: 240,
              }}
            >
              Leave per-scene notes, iterate with your team, and feed them
              back into the Director on the next pass.
            </div>
          </div>

          <button
            onClick={() => onUpsell?.()}
            style={{
              position: "relative",
              zIndex: 1,
              marginTop: 4,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(122,162,255,0.55)",
              background:
                "linear-gradient(180deg, rgba(122,162,255,0.28), rgba(167,139,250,0.20))",
              color: "white",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow:
                "0 6px 20px -6px rgba(122,162,255,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
            }}
          >
            <span>Upgrade to unlock</span>
            <IconArrowRight size={13} />
          </button>

          <span
            className="mf-mono"
            style={{
              position: "relative",
              zIndex: 1,
              fontSize: 9.5,
              letterSpacing: "0.16em",
              color: "var(--ink-4)",
            }}
          >
            FROM $19 / MONTH
          </span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
            {comments.length === 0 ? (
              <div
                style={{
                  padding: "16px 14px",
                  borderRadius: 10,
                  border: "1px dashed var(--line-2)",
                  background: "rgba(255,255,255,0.015)",
                  color: "var(--ink-3)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                No comments yet. Add the first one below.
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      className="mf-mono"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.12em",
                        color: "var(--ink-3)",
                        textTransform: "uppercase",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.author ?? "ANON"} · {relativeTimeShort(c.created_at)}
                    </span>
                    <button
                      onClick={() => removeComment(c.id)}
                      aria-label="Delete comment"
                      title="Delete"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ink-4)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 10,
                      }}
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--ink-1)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {c.text}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !submitting) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Leave a comment on this scene…"
              rows={3}
              disabled={submitting}
              style={{
                resize: "vertical",
                minHeight: 64,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--line)",
                color: "var(--ink-1)",
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.5,
                outline: "none",
              }}
            />
            {error && (
              <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>{error}</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                className="mf-mono"
                style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.1em" }}
              >
                ⌘+ENTER
              </span>
              <button
                onClick={() => void submit()}
                disabled={submitting || !draft.trim()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "rgba(122,162,255,0.16)",
                  border: "1px solid rgba(122,162,255,0.45)",
                  color: "var(--ink-1)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting || !draft.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? "Posting…" : "Add comment"}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};

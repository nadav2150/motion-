import { useRef, useState } from "react";
import {
  AppChrome,
  Button,
  IconArrowRight,
  IconPlay,
  IconPlus,
  IconSparkle,
  IconTrash,
  useIsMobile,
  type NavKey,
} from "../primitives";

export type ProjectCard = {
  id: string;
  title: string;
  statusLabel: "Ready" | "Rendering" | "Storyboard" | "Generating" | "Directing" | "Failed" | "Draft";
  metaLabel: string;
  updatedLabel: string;
  thumbnailUrl: string | null;
  accent: string;
  openTarget: "editor" | "export";
  // Pre-formatted ("Directed in 12s" / "Directed in 1m 04s"). Null until the
  // job first reaches `scenes_ready`.
  directDurationLabel: string | null;
};

const STATUS_DOT: Record<ProjectCard["statusLabel"], string> = {
  Ready: "#A6F0BD",
  Rendering: "#67E8F9",
  Storyboard: "#7AA2FF",
  Generating: "#A78BFA",
  Directing: "#A78BFA",
  Failed: "#FCA5A5",
  Draft: "var(--ink-4)",
};

export const ProjectsScreen = ({
  authed,
  projects,
  debug,
  credits,
  onNav,
  onOpenProject,
  onNewProject,
  onDeleteProject,
  onSignIn,
}: {
  authed: boolean;
  projects: ProjectCard[];
  debug?: {
    userId: string | null;
    email: string | null;
    queryCount: number;
    error: string | null;
  };
  credits?: number | null;
  onNav?: (k: NavKey) => void;
  onOpenProject?: (id: string, target: "editor" | "export") => void;
  onNewProject?: () => void;
  onDeleteProject?: (id: string) => Promise<void> | void;
  onSignIn?: () => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const m = useIsMobile(rootRef, 720);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [confirmDelete, setConfirmDelete] = useState<ProjectCard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestDelete = (p: ProjectCard) => {
    setDeleteError(null);
    setConfirmDelete(p);
  };

  const cancelDelete = () => {
    if (deleting) return;
    setConfirmDelete(null);
    setDeleteError(null);
  };

  const performDelete = async () => {
    if (!confirmDelete || !onDeleteProject) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteProject(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
    <AppChrome
      active="projects"
      onNav={onNav}
      project="Projects"
      credits={credits}
      mobile={m}
      right={
        m ? (
          <Button variant="primary" size="sm" onClick={onNewProject} iconRight={<IconPlus size={14}/>}>New</Button>
        ) : (
        <>
          <div style={{ display: "flex", padding: 3, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "5px 10px", fontSize: 11, borderRadius: 5,
                  background: view === v ? "rgba(255,255,255,0.06)" : "transparent",
                  border: view === v ? "1px solid var(--line-2)" : "1px solid transparent",
                  color: view === v ? "var(--ink-0)" : "var(--ink-3)",
                  cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={onNewProject} iconRight={<IconPlus size={14}/>}>New project</Button>
        </>
        )
      }
    >
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: m ? "28px 18px 56px" : "48px 56px 80px", maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ marginBottom: m ? 24 : 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: m ? 10 : 12 }}>WORKSPACE</div>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: m ? 28 : 40 }}>
            Projects
            {projects.length > 0 && (
              <span style={{ color: "var(--ink-3)" }}>
                {" "}· {projects.length} {projects.length === 1 ? "film" : "films"} in flight
              </span>
            )}
          </h1>
          {authed && debug && (
            <div
              className="mf-mono"
              style={{
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: debug.error
                  ? "rgba(255,107,107,0.06)"
                  : "rgba(255,255,255,0.025)",
                border: debug.error
                  ? "1px solid rgba(255,107,107,0.30)"
                  : "1px solid var(--line)",
                color: debug.error ? "#FCA5A5" : "var(--ink-3)",
                fontSize: 10.5,
                letterSpacing: "0.06em",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>SIGNED IN AS · {debug.email ?? "—"}</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span>USER {debug.userId?.slice(0, 8) ?? "—"}…</span>
              <span style={{ opacity: 0.45 }}>·</span>
              <span>QUERY RETURNED {debug.queryCount} ROW{debug.queryCount === 1 ? "" : "S"}</span>
              {debug.error && (
                <>
                  <span style={{ opacity: 0.45 }}>·</span>
                  <span>ERROR: {debug.error}</span>
                </>
              )}
            </div>
          )}
        </div>

        {!authed ? (
          <EmptyState
            title="Sign in to see your projects."
            sub="Your directed storyboards live in your workspace once you sign in."
            cta={<Button variant="primary" size="md" onClick={onSignIn} iconRight={<IconArrowRight size={13}/>}>Sign in</Button>}
          />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet."
            sub="Direct your first launch film. The director will split your script into 5–14 cinematic shots."
            cta={<Button variant="primary" size="md" onClick={onNewProject} iconRight={<IconPlus size={14}/>}>New project</Button>}
          />
        ) : view === "grid" ? (
          <ProjectGrid projects={projects} onOpenProject={onOpenProject} onRequestDelete={requestDelete}/>
        ) : (
          <ProjectList projects={projects} onOpenProject={onOpenProject} onRequestDelete={requestDelete}/>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDeleteDialog
          project={confirmDelete}
          deleting={deleting}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={performDelete}
        />
      )}
    </AppChrome>
    </div>
  );
};

const ProjectGrid = ({
  projects,
  onOpenProject,
  onRequestDelete,
}: {
  projects: ProjectCard[];
  onOpenProject?: (id: string, target: "editor" | "export") => void;
  onRequestDelete?: (project: ProjectCard) => void;
}) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
    {projects.map((p) => {
      const dot = STATUS_DOT[p.statusLabel];
      const bg = p.thumbnailUrl
        ? `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%), url(${p.thumbnailUrl}) center/cover`
        : p.accent;
      return (
        <div
          key={p.id}
          className="mf-project-card"
          style={{
            position: "relative",
            borderRadius: 14, overflow: "hidden",
            background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
            transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.borderColor = "var(--line-2)";
            e.currentTarget.style.boxShadow = "0 20px 40px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(122,162,255,0.10)";
            const del = e.currentTarget.querySelector<HTMLButtonElement>("[data-delete-btn]");
            if (del) del.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.borderColor = "var(--line)";
            e.currentTarget.style.boxShadow = "";
            const del = e.currentTarget.querySelector<HTMLButtonElement>("[data-delete-btn]");
            if (del) del.style.opacity = "0";
          }}
        >
          <button
            onClick={() => onOpenProject?.(p.id, p.openTarget)}
            style={{
              display: "block", width: "100%", padding: 0, border: 0,
              background: "transparent", cursor: "pointer",
              fontFamily: "inherit", textAlign: "left", color: "inherit",
            }}
          >
          <div style={{ aspectRatio: "16/10", background: bg, position: "relative", overflow: "hidden" }}>
            {!p.thumbnailUrl && (
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 55%)" }}/>
            )}
            <div style={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, boxShadow: `0 0 8px ${dot}` }}/> {p.statusLabel}
            </div>
            <div style={{ position: "absolute", right: 12, bottom: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(10px)", display: "grid", placeItems: "center", paddingLeft: 2, color: "white" }}>
              <IconPlay size={12}/>
            </div>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 500, letterSpacing: "-0.015em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{p.title}</div>
              <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 4 }}>
                {p.updatedLabel.toUpperCase()}
                {p.directDurationLabel && (
                  <>
                    <span style={{ opacity: 0.45, margin: "0 6px" }}>·</span>
                    <span>{p.directDurationLabel.toUpperCase()}</span>
                  </>
                )}
              </div>
            </div>
            <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", flexShrink: 0, marginLeft: 8 }}>
              {p.metaLabel}
            </div>
          </div>
          </button>
          {onRequestDelete && (
            <button
              data-delete-btn
              aria-label={`Delete ${p.title}`}
              title="Delete project"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(p);
              }}
              style={{
                position: "absolute", top: 10, right: 10,
                width: 28, height: 28, borderRadius: 7,
                display: "grid", placeItems: "center",
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white", cursor: "pointer",
                backdropFilter: "blur(10px)",
                opacity: 0,
                transition: "opacity 160ms ease, background 160ms ease, border-color 160ms ease",
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(252,165,165,0.18)";
                e.currentTarget.style.borderColor = "rgba(252,165,165,0.55)";
                e.currentTarget.style.color = "#FCA5A5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(0,0,0,0.55)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                e.currentTarget.style.color = "white";
              }}
              onFocus={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              <IconTrash size={13}/>
            </button>
          )}
        </div>
      );
    })}
  </div>
);

const ProjectList = ({
  projects,
  onOpenProject,
  onRequestDelete,
}: {
  projects: ProjectCard[];
  onOpenProject?: (id: string, target: "editor" | "export") => void;
  onRequestDelete?: (project: ProjectCard) => void;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
    {projects.map((p, i) => {
      const dot = STATUS_DOT[p.statusLabel];
      return (
        <div
          key={p.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenProject?.(p.id, p.openTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenProject?.(p.id, p.openTarget);
            }
          }}
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 120px 120px 90px 36px",
            gap: 14,
            alignItems: "center",
            padding: "12px 16px",
            background: "rgba(255,255,255,0.015)",
            borderTop: i === 0 ? "0" : "1px solid var(--line)",
            cursor: "pointer",
            color: "inherit",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 56, height: 36, borderRadius: 6,
              background: p.thumbnailUrl ? `url(${p.thumbnailUrl}) center/cover` : p.accent,
              border: "1px solid var(--line)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
          </div>
          <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
            {p.updatedLabel.toUpperCase()}
            {p.directDurationLabel && (
              <div style={{ marginTop: 2, opacity: 0.7 }}>
                {p.directDurationLabel.toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, boxShadow: `0 0 8px ${dot}`, flexShrink: 0 }}/>
            <span>{p.statusLabel}</span>
          </div>
          <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em", textAlign: "right" }}>
            {p.metaLabel}
          </div>
          {onRequestDelete ? (
            <button
              aria-label={`Delete ${p.title}`}
              title="Delete project"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(p);
              }}
              style={{
                width: 28, height: 28, borderRadius: 6,
                display: "grid", placeItems: "center",
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--ink-3)", cursor: "pointer",
                padding: 0,
                transition: "background 160ms ease, color 160ms ease, border-color 160ms ease",
                justifySelf: "end",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(252,165,165,0.10)";
                e.currentTarget.style.borderColor = "rgba(252,165,165,0.45)";
                e.currentTarget.style.color = "#FCA5A5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.color = "var(--ink-3)";
              }}
            >
              <IconTrash size={13}/>
            </button>
          ) : <div/>}
        </div>
      );
    })}
  </div>
);

const ConfirmDeleteDialog = ({
  project,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  project: ProjectCard;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <div
    onClick={onCancel}
    style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      display: "grid", placeItems: "center",
      padding: 24,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%", maxWidth: 440,
        borderRadius: 16,
        background: "var(--bg-1, #0F1115)",
        border: "1px solid var(--line-2)",
        padding: "26px 26px 22px",
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 11,
          background: "rgba(252,165,165,0.10)",
          border: "1px solid rgba(252,165,165,0.35)",
          color: "#FCA5A5",
          display: "grid", placeItems: "center",
          marginBottom: 16,
        }}
      >
        <IconTrash size={18}/>
      </div>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.015em" }}>
        Delete this project?
      </h3>
      <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        <strong style={{ color: "var(--ink-0)", fontWeight: 500 }}>{project.title}</strong> and all of its shots will be permanently removed. This can't be undone.
      </p>
      {error && (
        <div
          style={{
            marginTop: 14, padding: "8px 12px", borderRadius: 8,
            background: "rgba(252,165,165,0.08)",
            border: "1px solid rgba(252,165,165,0.30)",
            color: "#FCA5A5", fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>Cancel</Button>
        <Button variant="danger" size="sm" onClick={onConfirm} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete project"}
        </Button>
      </div>
    </div>
  </div>
);

const EmptyState = ({
  title,
  sub,
  cta,
}: {
  title: string;
  sub: string;
  cta?: React.ReactNode;
}) => (
  <div
    style={{
      padding: "80px 32px",
      borderRadius: 18,
      border: "1px dashed var(--line-2)",
      background: "rgba(255,255,255,0.015)",
      display: "grid",
      placeItems: "center",
      textAlign: "center",
    }}
  >
    <div style={{ maxWidth: 540 }}>
      <div
        style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--grad-aurora)",
          display: "grid", placeItems: "center", color: "white", margin: "0 auto 22px",
          boxShadow: "0 12px 32px -8px rgba(122,162,255,0.55)",
        }}
      >
        <IconSparkle size={20} stroke={2}/>
      </div>
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>{title}</h2>
      <p style={{ marginTop: 12, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{sub}</p>
      {cta && <div style={{ marginTop: 22 }}>{cta}</div>}
    </div>
  </div>
);

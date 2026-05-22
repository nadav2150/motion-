import {
  CinemaPreview,
  IconChevron,
  IconPause,
  IconPlay,
} from "../../../primitives";
import { EmptyState, TransportBtn } from "../shared";
import { HtmlScenePane } from "../HtmlScenePane";
import { PreviewMasterVideo } from "./PreviewMasterVideo";
import { GenerationLoader } from "./GenerationLoader";
import { fmtTime, readDraggedAsset } from "../../utils";
import type { JobStatus, ShotRow } from "../../types";
import type { SceneTiming } from "../../hooks/use-playback";

// Statuses that should show the full-pipeline GenerationLoader instead of
// the storyboard preview. scenes_ready is intentionally absent — that's
// the user-facing review pause before clicking Export. completed is also
// absent because we want to render the actual video then.
const LOADING_STATUSES: JobStatus[] = [
  "pending",
  "directing",
  "asset_planning",
  "audio_direction",
  "generating_scenes",
  "vision_critique",
  "refining_scenes",
  "rendering",
  "rendering_scenes",
  "stitching",
];

export const CinemaPreviewPane = ({
  f,
  status,
  showStoryboard,
  shots,
  previewShotInline,
  sceneTimings,
  time,
  localSceneTime,
  totalDuration,
  playing,
  setPlaying,
  goPrevScene,
  goNextScene,
  previewDragOver,
  setPreviewDragOver,
  onAssetDropToPreview,
  jobCreatedAt,
  expectedSceneCount,
}: {
  f: number;
  status: JobStatus;
  showStoryboard: boolean;
  shots: ShotRow[];
  previewShotInline: ShotRow | null;
  sceneTimings: Map<string, SceneTiming>;
  time: number;
  /** time - activeScene.startSeconds. Used by per-scene media (legacy
   *  clip_url) that has its own t=0 per scene. */
  localSceneTime: number;
  totalDuration: number;
  playing: boolean;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  goPrevScene: () => void;
  goNextScene: () => void;
  previewDragOver: boolean;
  setPreviewDragOver: (v: boolean) => void;
  onAssetDropToPreview: (shotId: string, asset: ReturnType<typeof readDraggedAsset>) => void;
  /** ISO timestamp of jobs.created_at. Powers the live "~N min remaining"
   *  countdown in the GenerationLoader. */
  jobCreatedAt: string | null;
  /** Best-known scene count for the loader's ETA. shots.length once they
   *  exist, planFeatures.maxScenes as the upfront estimate. */
  expectedSceneCount: number;
}) => (
  <section style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, position: "relative" }}>
    <div className="mf-bg-bloom"/>
    {!showStoryboard ? (
      <EmptyState f={f} />
    ) : LOADING_STATUSES.includes(status) ? (
      <GenerationLoader
        status={status}
        jobCreatedAt={jobCreatedAt}
        expectedSceneCount={
          shots.length > 0 ? shots.length : expectedSceneCount
        }
      />
    ) : (
      <div style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 20, position: "relative", minHeight: 0, flex: 1 }}>
        <div
          onDragOver={(e) => {
            if (!previewShotInline) return;
            if (
              Array.from(e.dataTransfer.types).includes(
                "application/x-mg-asset",
              )
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setPreviewDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setPreviewDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setPreviewDragOver(false);
            if (!previewShotInline) return;
            const asset = readDraggedAsset(e);
            if (!asset) return;
            onAssetDropToPreview(previewShotInline.id, asset);
          }}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            borderRadius: 14,
            outline: previewDragOver
              ? "2px dashed rgba(122,162,255,0.7)"
              : "none",
            outlineOffset: 4,
            transition: "outline-color 120ms",
          }}
        >
          <CinemaPreview
            aspect="16 / 9"
            frame={f}
            label={
              previewShotInline
                ? `SCENE ${String(previewShotInline.shot_index + 1).padStart(2, "0")} · ${(previewShotInline.shot_goal ?? "UNTITLED").toUpperCase()}`
                : undefined
            }
            style={{ flex: 1, minHeight: 0 }}
          >
            {/* Underlay: rendered video > html scene (iframe slaved to global
                clock) > legacy clip > image > standalone thumbnail. The video
                and iframe are slaves of the editor's global clock — they
                receive `time` and seek to it; they never run an independent
                playhead. See use-playback.ts for the clock. */}
            {previewShotInline?.rendered_video_url ? (
              <PreviewMasterVideo
                src={previewShotInline.rendered_video_url}
                time={time}
                playing={playing}
                poster={previewShotInline.scene_thumbnail_path}
              />
            ) : previewShotInline?.scene_html_path ? (
              <HtmlScenePane
                shot={previewShotInline}
                playing={playing}
                time={time}
                startSeconds={
                  sceneTimings.get(previewShotInline.id)?.startSeconds ?? 0
                }
              />
            ) : previewShotInline?.scene_thumbnail_path ? (
              <img
                src={previewShotInline.scene_thumbnail_path}
                alt=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain",
                  background: "#050505",
                }}
              />
            ) : previewShotInline?.clip_status === "ready" && previewShotInline.clip_url ? (
              // Legacy per-scene clip: each scene has its own short MP4. Seek
              // by scene-local time (not global) so when the playhead crosses
              // into this scene we resume at the right offset.
              <PreviewMasterVideo
                src={previewShotInline.clip_url}
                time={localSceneTime}
                playing={playing}
                poster={previewShotInline.image_url}
              />
            ) : previewShotInline?.image_url ? (
              <img
                src={previewShotInline.image_url}
                alt=""
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain",
                  background: "#050505",
                }}
              />
            ) : null}

            {/* Caption overlay from current shot's text */}
            {previewShotInline?.text_overlay && (
              <div style={{ position: "absolute", left: "50%", bottom: 64, transform: "translateX(-50%)", textAlign: "center", maxWidth: "70%" }}>
                <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
                  {previewShotInline.text_overlay}
                </div>
              </div>
            )}

          </CinemaPreview>
        </div>

        {/* Transport */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="mf-mono" style={{ fontSize: 12, letterSpacing: "0.06em", color: "var(--ink-1)" }}>
            {fmtTime(time)} <span style={{ color: "var(--ink-4)" }}>/ {fmtTime(totalDuration)}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <TransportBtn onClick={goPrevScene}><IconChevron size={16} style={{ transform: "rotate(90deg)" }}/></TransportBtn>
            <TransportBtn primary onClick={() => setPlaying((p) => !p)}>
              {playing ? <IconPause size={14}/> : <IconPlay size={14}/>}
            </TransportBtn>
            <TransportBtn onClick={goNextScene}><IconChevron size={16} style={{ transform: "rotate(-90deg)" }}/></TransportBtn>
          </div>
          <div className="mf-mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
            {shots.length} SCENES · {totalDuration.toFixed(1)}s
          </div>
        </div>
      </div>
    )}
  </section>
);

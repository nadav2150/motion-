import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppChrome,
  Button,
  IconArrowRight,
  IconLayers,
  IconMic,
  IconShare,
  IconWand,
  Pill,
  useFrame,
  type NavKey,
} from "../primitives";
import type { JobStatus } from "../editor/types";
import { TERMINAL, inputStyle } from "../editor/constants";
import {
  AccordionSection,
  ComingSoonPanel,
  GenerateButton,
  StatusPill,
} from "../editor/components/shared";
import { ScenePreviewModal } from "../editor/components/ScenePreviewModal";
import { TimelineRow } from "../editor/components/TimelineRow";
import { ScenesPanel } from "../editor/components/ScenesPanel";
import { useScript } from "../editor/hooks/use-script";
import { useBrand } from "../editor/hooks/use-brand";
import { useJobAssets } from "../editor/hooks/use-job-assets";
import { usePlayback } from "../editor/hooks/use-playback";
import { useJob } from "../editor/hooks/use-job";
import { BrandSection } from "../editor/components/sidebar/BrandSection";
import { AssetsSection } from "../editor/components/sidebar/AssetsSection";
import { MusicSection } from "../editor/components/sidebar/MusicSection";
import { SfxSection } from "../editor/components/sidebar/SfxSection";
import { CinemaPreviewPane } from "../editor/components/preview/CinemaPreviewPane";
import { ClockDebugOverlay } from "../editor/components/ClockDebugOverlay";

export const EditorScreen = ({
  onNav,
  onContinue,
  empty = false,
  initialJobId,
}: {
  onNav?: (k: NavKey) => void;
  onContinue?: (jobId?: string | null) => void;
  empty?: boolean;
  initialJobId?: string | null;
}) => {
  const f = useFrame();

  const jobIdRef = useRef<string | null>(null);

  const {
    jobId,
    setJobId,
    job,
    setJob,
    shots,
    setShots,
    generating,
    error,
    setError,
    selected,
    setSelected,
    previewShotId,
    setPreviewShotId,
    retrying,
    generatingClips,
    setPollNonce,
    handleGenerate: runGenerate,
    handleRetry,
    handleGenerateClip,
  } = useJob({ initialJobId });

  const { script, setScript, openSections, toggleSection } = useScript({
    empty,
    initialJobId,
    job,
    onGenerate: () =>
      void runGenerate({
        script,
        brandLogoUrl: brandLogoUrl ?? null,
        brandLogoStoragePath: brandLogoStoragePath ?? null,
        brandColors: brandColors.length > 0 ? brandColors : null,
      }),
  });

  const {
    brandLogoUrl,
    brandLogoStoragePath,
    brandLogoName,
    brandLogoUploading,
    brandLogoError,
    brandColors,
    draftColor,
    setDraftColor,
    brandSourceUrl,
    setBrandSourceUrl,
    brandScraping,
    brandScrapeError,
    logoInputRef,
    onLogoChange,
    clearLogo,
    addColor,
    removeColor,
    handleScrapeFromUrl,
  } = useBrand({ jobId, job });

  const {
    jobAssets,
    assetsUploading,
    assetsError,
    assetsInputRef,
    uploadAsset,
    onAssetsChange,
    handleAssetDrop,
    removeAsset,
  } = useJobAssets({
    jobId,
    job,
    onShotAssetsUpdated: (shotId, assets) => {
      setShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, assets } : s)),
      );
    },
  });

  const [previewDragOver, setPreviewDragOver] = useState(false);

  // Click-handler that wraps the job-creating action with the latest payload
  // assembled from the script + brand hooks.
  const handleGenerate = () =>
    void runGenerate({
      script,
      brandLogoUrl: brandLogoUrl ?? null,
      brandLogoStoragePath: brandLogoStoragePath ?? null,
      brandColors: brandColors.length > 0 ? brandColors : null,
    });

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const status: JobStatus = job?.status ?? (generating ? "pending" : "pending");
  const showStoryboard = jobId !== null;

  // Wall-clock seconds from job creation ("Direct storyboard" click) until
  // status first flipped to scenes_ready. Persisted as `scenes_ready_at`, so
  // re-opening a finished project shows the same number.
  const directDurationLabel = useMemo(() => {
    if (!job?.scenes_ready_at || !job?.created_at) return null;
    const start = new Date(job.created_at).getTime();
    const end = new Date(job.scenes_ready_at).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    const sec = Math.round((end - start) / 1000);
    if (sec <= 0) return null;
    if (sec < 60) return `Directed in ${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s === 0 ? `Directed in ${m}m` : `Directed in ${m}m ${s}s`;
  }, [job?.scenes_ready_at, job?.created_at]);

  const {
    time,
    currentFrame,
    setTime,
    playing,
    setPlaying,
    totalDuration,
    sceneTimings,
    currentShot,
    activeSceneTiming,
    localSceneTime,
    audioRef,
    sfxRef,
    voRef,
    goPrevScene,
    goNextScene,
  } = usePlayback({ shots });

  const selectedShot = useMemo(
    () => shots.find((s) => s.id === selected) ?? null,
    [shots, selected],
  );

  const previewShot = useMemo(
    () => shots.find((s) => s.id === previewShotId) ?? null,
    [shots, previewShotId],
  );

  const previewTiming = previewShot ? sceneTimings.get(previewShot.id) ?? null : null;

  // Preview always tracks the playhead so clicking a timeline scene (which
  // seeks `time`) updates the visible scene without depending on selection.
  const previewShotInline = currentShot;

  return (
    <>
    <AppChrome
      active="editor"
      onNav={onNav}
      project={job?.title ?? "Untitled launch"}
      right={
        <>
          {showStoryboard ? (
            <>
              <StatusPill status={status} />
              {directDurationLabel && (
                <span
                  className="mf-mono"
                  title="Time from clicking Direct storyboard until scenes were ready"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "var(--ink-3)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {directDurationLabel.toUpperCase()}
                </span>
              )}
            </>
          ) : (
            <Pill icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF" }} />}>
              <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>NEW PROJECT · DRAFT</span>
            </Pill>
          )}
          <Button variant="ghost" size="sm" icon={<IconShare size={12}/>}>Share preview</Button>
          <GenerateButton
            onClick={handleGenerate}
            loading={generating || (showStoryboard && !TERMINAL.includes(status))}
            disabled={!script.trim()}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!jobId) return;
              if (status === "scenes_ready") {
                // Kick off the render+stitch phase. Bump pollNonce to resume polling.
                try {
                  const res = await fetch(`/api/jobs/${jobId}/export`, { method: "POST" });
                  const data = (await res.json()) as { error?: string };
                  if (!res.ok) {
                    setError(data.error ?? `Export failed (${res.status})`);
                    return;
                  }
                  setPollNonce((n) => n + 1);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Network error");
                }
              } else if (status === "completed") {
                onContinue?.(jobId);
              } else {
                onContinue?.(jobId);
              }
            }}
            iconRight={<IconArrowRight size={12}/>}
          >
            {status === "scenes_ready" ? "Export · render video" : "Export"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
       <div
         style={{
           display: "grid",
           gridTemplateColumns: showStoryboard ? "360px minmax(0, 1fr) 320px" : "360px minmax(0, 1fr)",
           minHeight: 0,
           minWidth: 0,
           width: "100%",
         }}
       >
        {/* Left: script input */}
        <aside
          style={{
            borderRight: "1px solid var(--line)",
            background: "rgba(8,9,13,0.5)",
            padding: "22px 20px",
            overflowY: "auto",
            display: "flex", flexDirection: "column", gap: 18,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <AccordionSection
              label="SCRIPT"
              badge={`${script.trim().length} CHARS`}
              open={openSections.has("script")}
              onToggle={() => toggleSection("script")}
            >
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste your script — release notes, a feature list, or a paragraph about your launch…"
                style={{ ...inputStyle, minHeight: 200, resize: "vertical" }}
              />
            </AccordionSection>

            <AccordionSection
              label="SCENES"
              badge={shots.length > 0 ? `${shots.length} ${shots.length === 1 ? "SHOT" : "SHOTS"}` : "—"}
              open={openSections.has("scenes")}
              onToggle={() => toggleSection("scenes")}
            >
              {shots.length === 0 ? (
                <ComingSoonPanel
                  icon={<IconLayers size={14}/>}
                  title="No scenes yet"
                  hint="Direct your script to generate scenes. Each scene becomes a HyperFrame in the storyboard."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {shots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPreviewShotId(s.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: selected === s.id ? "rgba(122,162,255,0.08)" : "transparent",
                        border: `1px solid ${selected === s.id ? "rgba(122,162,255,0.25)" : "transparent"}`,
                        color: "inherit",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <span
                        className="mf-mono"
                        style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}
                      >
                        {String(s.shot_index + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontSize: 12, color: "var(--ink-1)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {s.shot_goal ?? "Untitled shot"}
                      </span>
                      <span
                        className="mf-mono"
                        style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.06em" }}
                      >
                        {Number(s.duration).toFixed(1).replace(/\.0$/, "")}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </AccordionSection>

            <AccordionSection
              label="VOICEOVER"
              badge="—"
              open={openSections.has("voiceover")}
              onToggle={() => toggleSection("voiceover")}
            >
              <ComingSoonPanel
                icon={<IconMic size={14}/>}
                title="Voiceover narration"
                hint="Record or upload narration per scene. The director will sync timing to your audio."
              />
            </AccordionSection>

            <MusicSection
              open={openSections.has("music")}
              onToggle={() => toggleSection("music")}
              jobId={jobId}
              job={job}
              shots={shots}
              setJob={setJob}
              setShots={setShots}
            />

            <SfxSection
              open={openSections.has("sfx")}
              onToggle={() => toggleSection("sfx")}
              jobId={jobId}
              job={job}
              setJob={setJob}
            />

            <AssetsSection
              open={openSections.has("assets")}
              onToggle={() => toggleSection("assets")}
              jobAssets={jobAssets}
              assetsUploading={assetsUploading}
              assetsError={assetsError}
              assetsInputRef={assetsInputRef}
              onAssetsChange={onAssetsChange}
              removeAsset={removeAsset}
              canUpload={!!jobIdRef.current}
            />

            <BrandSection
              open={openSections.has("brand")}
              onToggle={() => toggleSection("brand")}
              brandLogoUrl={brandLogoUrl}
              brandLogoName={brandLogoName}
              brandLogoUploading={brandLogoUploading}
              brandLogoError={brandLogoError}
              brandColors={brandColors}
              draftColor={draftColor}
              setDraftColor={setDraftColor}
              brandSourceUrl={brandSourceUrl}
              setBrandSourceUrl={setBrandSourceUrl}
              brandScraping={brandScraping}
              brandScrapeError={brandScrapeError}
              logoInputRef={logoInputRef}
              onLogoChange={onLogoChange}
              clearLogo={clearLogo}
              addColor={addColor}
              removeColor={removeColor}
              handleScrapeFromUrl={handleScrapeFromUrl}
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!script.trim() || generating}
            style={{
              padding: "10px 14px", borderRadius: 10,
              border: "1px solid rgba(167,139,250,0.45)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              color: "#0B0C10", fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.005em",
              fontFamily: "inherit",
              cursor: !script.trim() || generating ? "not-allowed" : "pointer",
              opacity: !script.trim() || generating ? 0.65 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            {generating ? (
              <span
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(11,12,16,0.25)",
                  borderTopColor: "#0B0C10",
                  animation: "mf-spin-slow 0.6s linear infinite",
                }}
              />
            ) : (
              <IconWand size={12}/>
            )}
            {generating ? "Creating job…" : "Direct storyboard"}
          </button>

          {error && (
            <div
              style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.35)",
                fontSize: 11.5, color: "#FCA5A5", lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          )}

          {job && (
            <div
              style={{
                padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid var(--line)",
                display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {job.title ?? "Untitled"}
                </span>
                <StatusPill status={job.status} />
              </div>
              {job.error && (
                <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>{job.error}</div>
              )}
            </div>
          )}
        </aside>

        {/* Center: preview + transport */}
        <CinemaPreviewPane
          f={f}
          status={status}
          showStoryboard={showStoryboard}
          shots={shots}
          previewShotInline={previewShotInline}
          sceneTimings={sceneTimings}
          time={time}
          localSceneTime={localSceneTime}
          totalDuration={totalDuration}
          playing={playing}
          setPlaying={setPlaying}
          goPrevScene={goPrevScene}
          goNextScene={goNextScene}
          previewDragOver={previewDragOver}
          setPreviewDragOver={setPreviewDragOver}
          onAssetDropToPreview={(shotId, asset) => {
            if (!asset) return;
            void handleAssetDrop(shotId, "video", asset);
          }}
        />

        {/* Right: scene panel (assets + comments tabs) — only when generated */}
        {showStoryboard && (
          <ScenesPanel
            shot={selectedShot ?? previewShot ?? currentShot ?? null}
            onShotPatched={(updated) => {
              setShots((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
              );
            }}
            onAssetDrop={handleAssetDrop}
            onAssetsChanged={(shotId, assets) => {
              setShots((prev) =>
                prev.map((s) => (s.id === shotId ? { ...s, assets } : s)),
              );
            }}
          />
        )}

       </div>

       {/* Full-width timeline row */}
       {showStoryboard && (
         <TimelineRow
           shots={shots}
           totalDuration={totalDuration}
           time={time}
           setTime={setTime}
           setPlaying={setPlaying}
           selectedId={selected}
           onSelect={(id) => setSelected(id)}
           onPreview={(id) => setPreviewShotId(id)}
           sceneTimings={sceneTimings}
           onAssetDrop={handleAssetDrop}
         />
       )}
      </div>
      {/* Hidden audio elements — one per track. All three are slaved to the
          global clock in usePlayback. `loop` is fine on music because the
          background track is meant to be continuous; sfx/vo don't loop —
          their useEffect clears src when the scene window ends. */}
      <audio ref={audioRef} preload="auto" loop style={{ display: "none" }} />
      <audio ref={sfxRef} preload="auto" style={{ display: "none" }} />
      <audio ref={voRef} preload="auto" style={{ display: "none" }} />
    </AppChrome>
    {previewShot && (
      <ScenePreviewModal
        shot={previewShot}
        sceneStartSeconds={previewTiming?.startSeconds ?? 0}
        filmTotalSeconds={previewTiming?.totalSeconds ?? previewShot.duration}
        onClose={() => setPreviewShotId(null)}
      />
    )}
    <ClockDebugOverlay
      time={time}
      currentFrame={currentFrame}
      playing={playing}
      activeShot={currentShot}
      activeSceneTiming={activeSceneTiming}
      localSceneTime={localSceneTime}
      audioRef={audioRef}
      sfxRef={sfxRef}
      voRef={voRef}
    />
    </>
  );
};




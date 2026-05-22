import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { FaCrown } from "react-icons/fa";
import {
  AppChrome,
  Button,
  IconArrowRight,
  IconCheck,
  IconDownload,
  IconLayers,
  IconLink,
  IconLogo,
  IconMic,
  IconShare,
  IconWand,
  Pill,
  useFrame,
  useIsMobile,
  type NavKey,
} from "../primitives";
import { PaywallModal, type PaywallTrigger } from "../PaywallModal";
import { estimateJobCostBreakdown } from "../../lib/billing/estimate";
import { getPlanFeatures } from "../../lib/billing/plan-features";
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
import { VoiceoverSection } from "../editor/components/sidebar/VoiceoverSection";
import { CinemaPreviewPane } from "../editor/components/preview/CinemaPreviewPane";
import { ClockDebugOverlay } from "../editor/components/ClockDebugOverlay";

export const EditorScreen = ({
  onNav,
  onContinue,
  empty = false,
  initialJobId,
  credits,
  planTier,
}: {
  onNav?: (k: NavKey) => void;
  onContinue?: (jobId?: string | null) => void;
  empty?: boolean;
  initialJobId?: string | null;
  credits?: number | null;
  planTier?: string | null;
}) => {
  const f = useFrame();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Editor is desktop-only — the storyboard, scene inspector, and timeline
  // need a wide canvas. Below 720px we show a "desktop-only" gate per the
  // Director Studio design.
  const m = useIsMobile(rootRef, 720);

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

  const {
    script,
    setScript,
    openSections,
    toggleSection,
    audioTracks,
    setAudioTrack,
  } = useScript({
    empty,
    initialJobId,
    job,
    onGenerate: () =>
      void runGenerate({
        script,
        brandLogoUrl: brandLogoUrl ?? null,
        brandLogoStoragePath: brandLogoStoragePath ?? null,
        brandColors: brandColors.length > 0 ? brandColors : null,
        audioTracks,
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
  const [copiedKind, setCopiedKind] = useState<"share" | "link" | null>(null);

  const finalVideoUrl = shots[0]?.rendered_video_url ?? null;

  const copyVideoLink = async (kind: "share" | "link") => {
    if (!finalVideoUrl) return;
    try {
      await navigator.clipboard.writeText(finalVideoUrl);
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1600);
    } catch {
      // clipboard unavailable (insecure context / denied); ignore silently
    }
  };

  // Click-handler that wraps the job-creating action with the latest payload
  // assembled from the script + brand hooks. audioTracks is captured here at
  // the moment the user clicks Generate — server-side it's read once and
  // persisted on the job row, so post-Generate toggling has no effect.
  const handleGenerate = () =>
    void runGenerate({
      script,
      brandLogoUrl: brandLogoUrl ?? null,
      brandLogoStoragePath: brandLogoStoragePath ?? null,
      brandColors: brandColors.length > 0 ? brandColors : null,
      audioTracks,
    });

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const status: JobStatus = job?.status ?? (generating ? "pending" : "pending");
  const showStoryboard = jobId !== null;
  // Audio toggles only affect the next Generate. Once a job exists (whether
  // running or finished) the toggles freeze — the worker has already read
  // audio_*_enabled from the row and acting on them later would mislead.
  const audioLocked = generating || jobId !== null;

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
  } = usePlayback({ shots, job });

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

  const navigate = useNavigate();

  // Plan-driven UI gating. Free plan has audio: false → all three audio
  // toggles render as crowns instead of switches.
  const planFeatures = useMemo(() => getPlanFeatures(planTier ?? null), [planTier]);

  // Live cost estimate — recomputes as the user flips toggles. We pass
  // planFeatures.maxScenes (not a script-length heuristic) so the displayed
  // number matches the worst-case reservation the server will actually do
  // at job creation. Unused credits refund after generation.
  const estimate = useMemo(
    () =>
      estimateJobCostBreakdown({
        sceneCountGuess: planFeatures.maxScenes,
        video: false,
        // If the plan blocks audio we never include audio costs in the preview,
        // even if the toggle state was carried over from a higher-tier session.
        audioVoiceover: planFeatures.audio && audioTracks.voiceover,
        audioMusic:     planFeatures.audio && audioTracks.music,
        audioSfx:       planFeatures.audio && audioTracks.sfx,
      }),
    [planFeatures.maxScenes, planFeatures.audio, audioTracks],
  );

  const insufficientCredits =
    typeof credits === "number" && credits < estimate.total;

  const [paywall, setPaywall] = useState<PaywallTrigger | null>(null);

  // Refresh route loader data (credits + planTier) whenever the job hits a
  // terminal state. The reservation refund + actual consumption have just
  // settled on the server, so the in-page balance is stale until we
  // revalidate. Without this the credits pill keeps showing the pre-job
  // balance and the helper line never flips to the "out of credits" state.
  const revalidator = useRevalidator();
  const prevTerminalRef = useRef(false);
  useEffect(() => {
    if (!jobId || !job) return;
    const isTerminal = TERMINAL.includes(job.status as JobStatus);
    if (isTerminal && !prevTerminalRef.current) {
      revalidator.revalidate();
    }
    prevTerminalRef.current = isTerminal;
  }, [jobId, job, revalidator]);

  // Auto-open the paywall the first time the balance drops below the
  // worst-case reservation. Fires once per page life — once the user
  // closes it, we don't keep popping it back up until the next
  // false→true transition (e.g., a credit pack purchase, then another job
  // that exhausts the new balance).
  const prevInsufficientRef = useRef(insufficientCredits);
  useEffect(() => {
    if (insufficientCredits && !prevInsufficientRef.current && paywall === null) {
      setPaywall("insufficient_credits");
    }
    prevInsufficientRef.current = insufficientCredits;
  }, [insufficientCredits, paywall]);

  // Wraps handleGenerate so the paywall fires instead of the API when the
  // user doesn't have enough credits. Plan-locked toggles are blocked at
  // the section level (their switch is replaced with a crown), so we don't
  // need to re-check audio gating here.
  const handlePrimaryAction = () => {
    if (insufficientCredits) {
      setPaywall("insufficient_credits");
      return;
    }
    handleGenerate();
  };

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
    {m ? (
      <EditorMobileGate f={f} onBackHome={() => onNav?.("home")} />
    ) : (
    <>
    <AppChrome
      active="editor"
      onNav={onNav}
      project={job?.title ?? "Untitled launch"}
      credits={credits}
      right={
        <>
          {!showStoryboard && (
            <Pill icon={<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7AA2FF" }} />}>
              <span className="mf-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>NEW PROJECT · DRAFT</span>
            </Pill>
          )}
          <GenerateButton
            onClick={handlePrimaryAction}
            loading={generating || (showStoryboard && !TERMINAL.includes(status))}
            disabled={!script.trim()}
          />
          {status === "completed" && finalVideoUrl ? (
            <>
              <a
                href={finalVideoUrl}
                download={`${(job?.title ?? "motionflow").replace(/[^a-zA-Z0-9_-]+/g, "-")}.mp4`}
                style={{ textDecoration: "none" }}
              >
                <Button variant="primary" size="sm" icon={<IconDownload size={12} />}>
                  Download MP4
                </Button>
              </a>
              <Button
                variant="ghost"
                size="sm"
                icon={copiedKind === "share" ? <IconCheck size={12} /> : <IconShare size={12} />}
                onClick={() => void copyVideoLink("share")}
              >
                {copiedKind === "share" ? "Link copied" : "Share"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={copiedKind === "link" ? <IconCheck size={12} /> : <IconLink size={12} />}
                onClick={() => void copyVideoLink("link")}
              >
                {copiedKind === "link" ? "Copied" : "Copy link"}
              </Button>
            </>
          ) : status === "rendering_scenes" || status === "stitching" ? (
            <Button variant="ghost" size="sm" disabled>
              Building video…
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!jobId || status !== "scenes_ready"}
              onClick={async () => {
                if (!jobId || status !== "scenes_ready") return;
                // Kick off the render phase. Bump pollNonce to resume polling
                // so the header swaps to Download/Share once it finishes.
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
              }}
              iconRight={status === "scenes_ready" ? <IconArrowRight size={12} /> : undefined}
            >
              Export
            </Button>
          )}
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
              badge={
                planFeatures.maxScriptChars !== null
                  ? `${script.length} / ${planFeatures.maxScriptChars} CHARS`
                  : `${script.trim().length} CHARS`
              }
              open={openSections.has("script")}
              onToggle={() => toggleSection("script")}
            >
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste your script — release notes, a feature list, or a paragraph about your launch…"
                maxLength={planFeatures.maxScriptChars ?? undefined}
                style={{ ...inputStyle, minHeight: 200, resize: "vertical" }}
              />
              {planFeatures.maxScriptChars !== null &&
                script.length >= planFeatures.maxScriptChars && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      lineHeight: 1.45,
                      color: "#A78BFA",
                    }}
                  >
                    You've hit the {planFeatures.maxScriptChars}-character free-plan
                    limit. Upgrade for unlimited script length.
                  </div>
                )}
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

            <VoiceoverSection
              open={openSections.has("voiceover")}
              onToggle={() => toggleSection("voiceover")}
              shots={shots}
              enabled={audioTracks.voiceover}
              onEnabledChange={(v) => setAudioTrack("voiceover", v)}
              locked={audioLocked}
              planLocked={!planFeatures.audio}
              onUpsell={() => setPaywall("audio_locked")}
            />

            <MusicSection
              open={openSections.has("music")}
              onToggle={() => toggleSection("music")}
              jobId={jobId}
              job={job}
              shots={shots}
              setJob={setJob}
              setShots={setShots}
              enabled={audioTracks.music}
              onEnabledChange={(v) => setAudioTrack("music", v)}
              locked={audioLocked}
              planLocked={!planFeatures.audio}
              onUpsell={() => setPaywall("audio_locked")}
            />

            <SfxSection
              open={openSections.has("sfx")}
              onToggle={() => toggleSection("sfx")}
              jobId={jobId}
              job={job}
              shots={shots}
              setJob={setJob}
              enabled={audioTracks.sfx}
              onEnabledChange={(v) => setAudioTrack("sfx", v)}
              locked={audioLocked}
              planLocked={!planFeatures.audio}
              onUpsell={() => setPaywall("audio_locked")}
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
            onClick={handlePrimaryAction}
            disabled={!script.trim() || generating}
            style={{
              padding: "10px 14px", borderRadius: 10,
              border: "1px solid rgba(167,139,250,0.45)",
              background: "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
              color: "#0B0C10", fontSize: 12.5, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              fontFamily: "inherit",
              cursor: !script.trim() || generating ? "not-allowed" : "pointer",
              opacity: !script.trim() || generating ? 0.65 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(122,162,255,0.30), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            {generating && (
              <span
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  border: "2px solid rgba(11,12,16,0.25)",
                  borderTopColor: "#0B0C10",
                  animation: "mf-spin-slow 0.6s linear infinite",
                }}
              />
            )}
            {generating
              ? "Bringing it to life…"
              : insufficientCredits
                ? "Get more credits"
                : "Bring it to life"}
          </button>

          {!generating && (
            <div
              className="mf-mono"
              style={{
                marginTop: -2,
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textAlign: "center",
                color: insufficientCredits ? "#FCA5A5" : "var(--ink-3)",
              }}
              title={
                `Worst-case estimate: ${estimate.scenes} scene${estimate.scenes === 1 ? "" : "s"}` +
                ` (${estimate.jobBase + estimate.base} base` +
                (estimate.voiceover ? ` + ${estimate.voiceover} voiceover` : "") +
                (estimate.music ? ` + ${estimate.music} music` : "") +
                (estimate.sfx ? ` + ${estimate.sfx} sfx` : "") +
                `). Unused credits are refunded after generation.`
              }
            >
              {insufficientCredits ? "NEEDS " : "UP TO "}
              {estimate.total.toLocaleString()} CREDITS
              {typeof credits === "number" && (
                <> · BALANCE {credits.toLocaleString()}</>
              )}
            </div>
          )}

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
          jobCreatedAt={job?.created_at ?? null}
          expectedSceneCount={planFeatures.maxScenes}
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
            commentsLocked={!planFeatures.comments}
            onUpsell={() => setPaywall("comments_locked")}
            actions={
              status === "scenes_ready" ||
              status === "vision_critique" ||
              status === "refining_scenes" ? (
                <>
                  <div
                    className="mf-mono"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.16em",
                      color: "var(--ink-3)",
                    }}
                  >
                    REFINE
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={
                      planFeatures.critique ? (
                        <IconWand size={12} />
                      ) : (
                        <FaCrown size={11} color="#A78BFA" />
                      )
                    }
                    disabled={
                      planFeatures.critique &&
                      (!jobId ||
                        status === "vision_critique" ||
                        status === "refining_scenes" ||
                        !!job?.polished_at)
                    }
                    onClick={
                      !planFeatures.critique
                        ? () => setPaywall("critique_locked")
                        : async () => {
                            if (!jobId) return;
                            try {
                              const res = await fetch(
                                `/api/jobs/${jobId}/critique`,
                                { method: "POST" },
                              );
                              const data = (await res.json()) as {
                                error?: string;
                              };
                              if (!res.ok) {
                                setError(
                                  data.error ?? `Critique failed (${res.status})`,
                                );
                                return;
                              }
                              setPollNonce((n) => n + 1);
                            } catch (e) {
                              setError(
                                e instanceof Error ? e.message : "Network error",
                              );
                            }
                          }
                    }
                  >
                    {!planFeatures.critique
                      ? "Critique & polish"
                      : job?.polished_at
                        ? "Polished"
                        : status === "vision_critique" ||
                            status === "refining_scenes"
                          ? "Polishing…"
                          : "Critique & polish"}
                  </Button>
                  {(status === "scenes_ready" ||
                    status === "refining_scenes") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={
                        planFeatures.polish ? (
                          <IconWand size={12} />
                        ) : (
                          <FaCrown size={11} color="#A78BFA" />
                        )
                      }
                      disabled={
                        planFeatures.polish &&
                        (!jobId ||
                          status === "refining_scenes" ||
                          !shots.some((s) => {
                            const c = (s as { comments?: unknown }).comments;
                            return Array.isArray(c) && c.length > 0;
                          }))
                      }
                      onClick={
                        !planFeatures.polish
                          ? () => setPaywall("polish_locked")
                          : async () => {
                              if (!jobId) return;
                              try {
                                const res = await fetch(
                                  `/api/jobs/${jobId}/improve`,
                                  { method: "POST" },
                                );
                                const data = (await res.json()) as {
                                  error?: string;
                                };
                                if (!res.ok) {
                                  setError(
                                    data.error ??
                                      `Improve failed (${res.status})`,
                                  );
                                  return;
                                }
                                setPollNonce((n) => n + 1);
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Network error",
                                );
                              }
                            }
                      }
                    >
                      {status === "refining_scenes"
                        ? "Improving…"
                        : "Improve from comments"}
                    </Button>
                  )}
                </>
              ) : null
            }
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
    <PaywallModal
      open={paywall !== null}
      trigger={paywall ?? "generate"}
      planTier={planTier}
      onClose={() => setPaywall(null)}
      onUpgrade={(tier) => navigate(`/checkout?plan=${tier}`)}
      onSeePricing={() => navigate("/pricing")}
    />
    </>
    )}
    </div>
  );
};

// Desktop-only gate shown when the editor container is < 720px. Mirrors
// the design's DirectorMobileGate — aurora bloom, animated camera glyph,
// feature list of what's available on desktop, and a primary "Back to
// Home" CTA wired to the existing onNav callback.
const EditorMobileGate = ({
  f,
  onBackHome,
}: {
  f: number;
  onBackHome?: () => void;
}) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      background: "#06070A",
      color: "var(--ink-0)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Geist', system-ui, sans-serif",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `
          radial-gradient(600px 400px at ${30 + Math.sin(f / 120) * 8}% ${
          25 + Math.cos(f / 140) * 6
        }%, rgba(122,162,255,0.22), transparent 60%),
          radial-gradient(500px 360px at ${75 + Math.sin(f / 100) * 6}% ${
          78 + Math.cos(f / 130) * 8
        }%, rgba(167,139,250,0.18), transparent 60%),
          radial-gradient(400px 320px at 50% 110%, rgba(103,232,249,0.12), transparent 60%)
        `,
        filter: "blur(8px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: 0.35,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at center, black 30%, transparent 75%)",
      }}
    />

    <header
      style={{
        position: "relative",
        zIndex: 2,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <IconLogo size={20} />
        <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.01em" }}>
          Videly AI
        </span>
      </div>
      <div
        className="mf-mono"
        style={{ fontSize: 9.5, color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        DIRECTOR STUDIO
      </div>
    </header>

    <div
      style={{
        position: "relative",
        zIndex: 2,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 28px",
        textAlign: "center",
        overflow: "auto",
      }}
    >
      <div style={{ position: "relative", marginBottom: 28 }}>
        <div
          style={{
            position: "absolute",
            inset: -22,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(122,162,255,0.30), transparent 65%)",
            filter: "blur(20px)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            width: 72,
            height: 72,
            borderRadius: 20,
            background:
              "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
            display: "grid",
            placeItems: "center",
            color: "#0B0C10",
            boxShadow:
              "0 16px 40px -10px rgba(122,162,255,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
            transform: `rotate(${Math.sin(f / 60) * 1.5}deg)`,
            transition: "transform 200ms",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="15" height="10" rx="2" />
            <path d="M17 10l5-3v10l-5-3" />
            <circle cx="7" cy="12" r="1.4" />
          </svg>
        </div>
      </div>

      <div
        className="mf-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          color: "#7AA2FF",
          marginBottom: 14,
        }}
      >
        DESKTOP‑ONLY EXPERIENCE
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          maxWidth: 320,
        }}
      >
        Director Studio doesn't <span className="mf-grad-text">fit a small screen.</span>
      </h1>
      <p
        style={{
          margin: "14px auto 0",
          maxWidth: 320,
          fontSize: 13.5,
          color: "var(--ink-2)",
          lineHeight: 1.55,
        }}
      >
        The storyboard, shot inspector, and AI pipeline rely on a wide canvas.
        Open Videly on a laptop or desktop to direct your film.
      </p>

      <div
        style={{
          marginTop: 24,
          padding: "14px 16px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid var(--line)",
          maxWidth: 320,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          textAlign: "left",
        }}
      >
        {[
          "Multi-shot storyboard editor",
          "Per-shot composition & camera",
          "Live image → video pipeline",
          "Side-by-side render inspector",
        ].map((t) => (
          <div
            key={t}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
              color: "var(--ink-1)",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: "rgba(122,162,255,0.10)",
                border: "1px solid rgba(122,162,255,0.30)",
                color: "#7AA2FF",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <IconCheck size={10} stroke={2.5} />
            </span>
            {t}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <button
          onClick={onBackHome}
          style={{
            width: "100%",
            height: 44,
            borderRadius: 10,
            border: "1px solid rgba(167,139,250,0.45)",
            background:
              "linear-gradient(135deg, #7AA2FF 0%, #A78BFA 55%, #67E8F9 100%)",
            color: "#0B0C10",
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            fontFamily: "inherit",
            cursor: "pointer",
            boxShadow:
              "0 8px 28px rgba(122,162,255,0.32), inset 0 1px 0 rgba(255,255,255,0.22)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          Back to Home
          <IconArrowRight size={13} />
        </button>
        <button
          type="button"
          style={{
            width: "100%",
            height: 42,
            borderRadius: 10,
            background: "rgba(255,255,255,0.035)",
            border: "1px solid var(--line)",
            color: "var(--ink-1)",
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Email me a desktop link
        </button>
      </div>
    </div>

    <div
      className="mf-mono"
      style={{
        position: "relative",
        zIndex: 2,
        padding: "14px 18px",
        textAlign: "center",
        fontSize: 9.5,
        letterSpacing: "0.14em",
        color: "var(--ink-4)",
        borderTop: "1px solid var(--line)",
      }}
    >
      MIN WIDTH · 1024PX RECOMMENDED
    </div>
  </div>
);




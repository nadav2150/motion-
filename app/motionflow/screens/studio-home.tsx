// /home — hero + the prompt card (the core v2 UX) + recent videos.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  AudioLines,
  Check,
  Clock,
  Ellipsis,
  EllipsisVertical,
  FileVideo,
  Film,
  Globe,
  ImageIcon,
  Images,
  Languages,
  Link2,
  Monitor,
  Music,
  Palette,
  Pause,
  Play,
  Plus,
  Upload,
  LayoutTemplate,
  Loader2,
  Sparkles,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import type {
  CreateStudioJobInput,
  StudioFormat,
  StudioJobView,
  StudioSource,
  StudioTemplate,
  StudioVideoCard,
} from "../../lib/studio/types";
import { DURATION_OPTIONS } from "../../lib/studio/types";
import { api, ApiError, GENERATING_STAGES, isStudioJob, MAX_REFERENCE_MB, type VoiceOption } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button, IconButton, focusRing } from "../ui/Button";
import { Chip, Select, Toggle } from "../ui/controls";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { videoHref } from "../ui/VideoCard";
import { EmptyState } from "../ui/Card";
import { cn, formatNumber, formatTime } from "../ui/format";
import { PreviewPlayer, usePreviewController } from "../ui/Player";
import { FALLBACK_TEMPLATES } from "../ui/showcase";
import { LANGUAGES } from "../ui/languages";
import { readPrefs } from "../ui/prefs";

const FORMAT_OPTIONS: { value: StudioFormat; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "match", label: "Match reference" },
];

const VIDEO_KINDS = new Set(["youtube", "video_url", "upload"]);
const YT_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{6,}/i;

// Rough client-side estimate (plan Phase 5): base 1500 + review 300 +
// voiceover 150–300 + reference 50 + render 5/s. The server's estimate is
// authoritative; this only sets expectations.
export function estimateCredits(opts: { duration: number; voice: boolean; reference: boolean }): number {
  return 1500 + 300 + (opts.voice ? Math.round(150 + (opts.duration / 60) * 150) : 0) + (opts.reference ? 50 : 0) + opts.duration * 5;
}

type Pending = { id: string; name: string; progress: number; kind: "upload" | "image" };
type Inline = null | "youtube" | "website" | "video_url";

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function StudioHomeScreen({
  user,
  planTier,
  credits,
  voices: loaderVoices,
}: {
  user: ShellUser;
  planTier: string | null;
  credits: number | null;
  voices: VoiceOption[];
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [sources, setSources] = useState<StudioSource[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [inline, setInline] = useState<Inline>(null);
  const [inlineValue, setInlineValue] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [format, setFormat] = useState<StudioFormat>("16:9");
  const [voiceId, setVoiceId] = useState<string>("off");
  const [language, setLanguage] = useState("en");
  const [music, setMusic] = useState(true);
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [matchReference, setMatchReference] = useState(true);
  const [template, setTemplate] = useState<StudioTemplate | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>(loaderVoices);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; payment?: boolean } | null>(null);
  const [recent, setRecent] = useState<StudioVideoCard[] | null>(null);
  const [sample, setSample] = useState<HTMLAudioElement | null>(null);
  const [sampling, setSampling] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  // Recent Videos: the selected card plays in the banner player.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudioJobView | null>(null);

  const hasVideoRef = sources.some((s) => VIDEO_KINDS.has(s.kind));
  const canGenerate = (prompt.trim().length > 0 || hasVideoRef) && pending.length === 0 && !submitting;
  const estimate = estimateCredits({ duration, voice: voiceId !== "off", reference: hasVideoRef });
  const selectedVoice = voices.find((v) => v.id === voiceId);

  // Per-device defaults from Settings → Preferences.
  useEffect(() => {
    const p = readPrefs();
    if ((DURATION_OPTIONS as readonly number[]).includes(p.defaultDuration)) setDuration(p.defaultDuration);
    setLanguage(p.language);
  }, []);

  // Optional /api/voices (with preview URLs) overrides the loader's catalog.
  useEffect(() => {
    api.listVoices().then((v) => v && v.length && setVoices(v));
  }, []);

  const recentRef = useRef<StudioVideoCard[] | null>(null);
  recentRef.current = recent;
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .listVideos({ filter: "all", limit: 6 })
        .then((r) => alive && setRecent(r.items))
        .catch(() => alive && setRecent((x) => x ?? []));
    load();
    // Poll every 3 s while any recent video is still generating.
    const t = setInterval(() => {
      if (recentRef.current?.some((c) => c.stage && GENERATING_STAGES.has(c.stage))) load();
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const selected = recent?.find((c) => c.id === selectedId) ?? recent?.[0] ?? null;
  const selectedReady = !!selected && selected.generationMode === "v2" && !(selected.stage && GENERATING_STAGES.has(selected.stage));
  const detailRev = detail ? (detail.revisions.find((r) => r.revision === detail.currentRevision) ?? detail.revisions.at(-1) ?? null) : null;
  const ctl = usePreviewController(selected?.duration ?? 30);

  // Load the selected video's job so the banner can play its current revision.
  useEffect(() => {
    if (!selected || !selectedReady) {
      setDetail(null);
      return;
    }
    let alive = true;
    api
      .getJob(selected.id)
      .then((j) => alive && setDetail(isStudioJob(j) && j.revisions.length ? j : null))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [selected?.id, selectedReady]);

  // ?template=<id> pre-fills the card; ?focus=1 focuses the prompt.
  useEffect(() => {
    const tid = params.get("template");
    if (tid) {
      api
        .listTemplates()
        .catch(() => ({ items: FALLBACK_TEMPLATES }))
        .then(({ items }) => {
          const t = items.find((x) => x.id === tid) ?? FALLBACK_TEMPLATES.find((x) => x.id === tid);
          if (!t) return;
          setTemplate(t);
          setPrompt(t.prompt);
          setFormat(t.format);
          if ((DURATION_OPTIONS as readonly number[]).includes(t.duration)) setDuration(t.duration);
          promptRef.current?.focus();
        })
        .catch(() => {});
    }
    if (params.get("focus") === "1") {
      promptRef.current?.focus();
      promptRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("template"), params.get("focus")]);

  // "Match reference" only makes sense with a video reference attached.
  useEffect(() => {
    if (!hasVideoRef && format === "match") setFormat("16:9");
  }, [hasVideoRef, format]);

  useEffect(() => () => sample?.pause(), [sample]);

  const addVideoSource = useCallback((s: StudioSource) => {
    setSources((prev) => {
      const had = prev.some((x) => VIDEO_KINDS.has(x.kind));
      if (had) toast("Replaced the previous reference video — one per video.", "info");
      return [...prev.filter((x) => !VIDEO_KINDS.has(x.kind)), s];
    });
  }, []);

  const openInline = (kind: Inline) => {
    setInline(kind);
    setInlineValue("");
    setInlineError(null);
  };

  const submitInline = () => {
    const url = normalizeUrl(inlineValue);
    if (!url) {
      setInlineError("Enter a valid link.");
      return;
    }
    if (inline === "youtube") {
      if (!YT_RE.test(url)) {
        setInlineError("That doesn't look like a YouTube link.");
        return;
      }
      addVideoSource({ kind: "youtube", url });
    } else if (inline === "video_url") {
      addVideoSource({ kind: "video_url", url });
    } else if (inline === "website") {
      setSources((prev) => [...prev.filter((x) => x.kind !== "website"), { kind: "website", url }]);
    }
    setInline(null);
    setInlineValue("");
  };

  const onVideoFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_REFERENCE_MB * 1024 * 1024) {
      toast(`Reference videos must be ${MAX_REFERENCE_MB} MB or smaller — paste a link for larger clips.`, "error");
      return;
    }
    const pid = `p${Date.now()}`;
    setPending((p) => [...p, { id: pid, name: file.name, progress: 0, kind: "upload" }]);
    try {
      const r = await api.uploadReferenceVideo(file, (f) =>
        setPending((p) => p.map((x) => (x.id === pid ? { ...x, progress: f } : x))),
      );
      addVideoSource({ kind: "upload", url: r.referenceVideoUrl, name: r.name || file.name, storagePath: r.storagePath });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setPending((p) => p.filter((x) => x.id !== pid));
    }
  };

  const onImageFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await Promise.all(
      Array.from(files)
        .slice(0, 12)
        .map(async (file, i) => {
          if (!file.type.startsWith("image/")) return;
          const pid = `i${Date.now()}-${i}`;
          setPending((p) => [...p, { id: pid, name: file.name, progress: 0, kind: "image" }]);
          try {
            const a = await api.uploadAsset(
              file,
              (f) => setPending((p) => p.map((x) => (x.id === pid ? { ...x, progress: f } : x))),
              "image",
            );
            setSources((prev) => [...prev, { kind: "image", url: a.url, name: a.name, assetId: a.id }]);
          } catch (e) {
            toast(e instanceof Error ? e.message : `Couldn't upload ${file.name}`, "error");
          } finally {
            setPending((p) => p.filter((x) => x.id !== pid));
          }
        }),
    );
  };

  const toggleSample = () => {
    if (sampling && sample) {
      sample.pause();
      setSampling(false);
      return;
    }
    if (!selectedVoice?.previewUrl) return;
    const a = new Audio(selectedVoice.previewUrl);
    a.onended = () => setSampling(false);
    a.play().then(() => setSampling(true)).catch(() => setSampling(false));
    sample?.pause();
    setSample(a);
  };

  const generate = async () => {
    if (!canGenerate) return;
    setSubmitting(true);
    setError(null);
    const input: CreateStudioJobInput = {
      prompt: prompt.trim(),
      format,
      targetDuration: duration,
      language,
      voiceId: voiceId === "off" ? null : voiceId,
      musicEnabled: music,
      sources,
      useBrandKit,
      templateId: template?.id ?? null,
      ...(hasVideoRef ? { referenceMode: matchReference ? ("close" as const) : ("inspired" as const) } : {}),
    };
    try {
      const { id } = await api.createJob(input);
      navigate(`/videos/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.isPaymentRequired) {
        const needed = Number(e.body.needed ?? 0);
        const balance = Number(e.body.balance ?? 0);
        setError({
          message: needed
            ? `This video needs about ${formatNumber(needed)} credits and you have ${formatNumber(balance)}.`
            : e.message,
          payment: true,
        });
      } else {
        setError({ message: e instanceof Error ? e.message : "Something went wrong. Try again." });
      }
      setSubmitting(false);
    }
  };

  const sourceIcon = (s: StudioSource) => {
    switch (s.kind) {
      case "youtube":
        return <FaYoutube className="size-4 text-[#ff0033]" aria-hidden />;
      case "website":
        return <Globe className="size-4 text-silver" aria-hidden />;
      case "upload":
        return <FileVideo className="size-4 text-silver" aria-hidden />;
      case "video_url":
        return <Link2 className="size-4 text-silver" aria-hidden />;
      case "image":
        return <img src={s.url} alt="" className="size-6 rounded-md object-cover" />;
    }
  };
  const sourceLabel = (s: StudioSource) =>
    s.kind === "image" || s.kind === "upload" ? s.name : s.kind === "youtube" ? "YouTube video" : hostOf(s.url);

  const voiceOptions = useMemo(
    () => [
      { value: "off", label: "AI Voice: Off" },
      ...voices.map((v) => ({
        value: v.id,
        label: `${v.label}${v.accent ? ` · ${v.accent[0]!.toUpperCase()}${v.accent.slice(1)}` : ""}`,
      })),
    ],
    [voices],
  );

  // Shared look for the prompt-bar chips (Video / Images / URL / AI Voice).
  const chipCls =
    "inline-flex h-[46px] items-center gap-2.5 rounded-[14px] border border-[#262c35] bg-[#11171f] px-4 text-[15px] font-medium text-[#e6e7ea] transition-colors hover:border-[#3a414c] hover:bg-[#161d26]";
  const roundCls =
    "flex size-[46px] items-center justify-center rounded-full border border-[#262c35] bg-[#11171f] text-[#e6e7ea] transition-colors hover:border-[#3a414c] hover:bg-[#161d26]";
  const pillSelect =
    "h-[46px] rounded-[14px] border-[#262c35] bg-[#11171f] text-[15px] text-[#e6e7ea] hover:border-[#3a414c]";

  const languageLabel = LANGUAGES.find((l) => l.value === language)?.label ?? language;

  return (
    <AppShell user={user} planTier={planTier} credits={credits} bare wide>
      {/* Hero */}
      <section aria-labelledby="home-hero-title" className="relative -mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
        <div className="pointer-events-none absolute right-0 top-0 hidden h-[358px] w-[min(836px,62%)] md:block" aria-hidden>
          <img
            src="/images/home-hero-art.webp"
            alt=""
            width={836}
            height={358}
            fetchPriority="high"
            decoding="async"
            className="size-full object-cover object-left-top [mask-image:linear-gradient(90deg,transparent_0%,#000_16%,#000_100%),linear-gradient(180deg,#000_78%,transparent_100%)] [mask-composite:intersect]"
          />
        </div>
        <div className="relative px-4 pb-10 pt-8 sm:px-6 md:pb-12 lg:px-[52px] lg:pt-[96px]">
          <p className="text-[13px] font-medium uppercase tracking-[0.22em] text-coral">AI motion video creator</p>
          <h1
            id="home-hero-title"
            className="mt-4 max-w-[600px] text-[34px] font-bold leading-[1.08] tracking-[-0.025em] text-paper sm:text-[44px] lg:text-[50px]"
          >
            Turn any idea into a{" "}
            <span className="bg-[linear-gradient(90deg,#ef6f4b_0%,#f58a5c_60%,#f7a074_100%)] bg-clip-text text-transparent">
              stunning motion video.
            </span>
          </h1>
          <p className="mt-4 max-w-[430px] text-[17px] leading-[1.7] text-[#c9cbd1] sm:text-[19px]">
            Describe what you want, add your content, and get a professional video in minutes.
          </p>
        </div>
      </section>

      {/* Prompt bar */}
      <section aria-label="Create a video" className="relative z-[1] lg:mx-[60px]">
        <form
          className="rounded-[22px] bg-[linear-gradient(115deg,rgb(239_131_84/0.55)_0%,rgb(171_133_119/0.35)_45%,rgb(246_153_93/0.9)_100%)] p-[1.5px] shadow-[0_0_44px_-12px_rgb(239_131_84/0.6),0_24px_60px_-20px_rgb(0_0_0/0.8)]"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="rounded-[21px] bg-[#0e131a]/[0.97] px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
            {template && (
              <div className="mb-3">
                <Chip
                  icon={<LayoutTemplate className="size-4 text-coral" aria-hidden />}
                  onRemove={() => {
                    setTemplate(null);
                    const p = new URLSearchParams(params);
                    p.delete("template");
                    setParams(p, { replace: true });
                  }}
                  removeLabel="Remove template"
                >
                  Template: {template.name}
                </Chip>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Sparkles className="mt-[3px] size-6 shrink-0 fill-coral-400 text-coral" aria-hidden />
              <label htmlFor="prompt" className="sr-only">
                Describe your video
              </label>
              <textarea
                id="prompt"
                ref={promptRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void generate();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Describe your video..."
                className="block min-h-[30px] w-full resize-none border-0 bg-transparent p-0 text-[18px] leading-[1.6] text-paper placeholder:text-[#a3a8b0] focus-visible:outline-none"
              />
            </div>

            {inline && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <label htmlFor="inline-url" className="sr-only">
                    {inline === "youtube" ? "YouTube link" : inline === "website" ? "Website address" : "Video link"}
                  </label>
                  <input
                    id="inline-url"
                    autoFocus
                    value={inlineValue}
                    onChange={(e) => {
                      setInlineValue(e.target.value);
                      setInlineError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitInline();
                      }
                      if (e.key === "Escape") setInline(null);
                    }}
                    inputMode="url"
                    placeholder={
                      inline === "youtube"
                        ? "Paste a YouTube link — https://youtube.com/watch?v=…"
                        : inline === "website"
                          ? "Your website — https://example.com"
                          : "Direct link to a video file (.mp4)"
                    }
                    aria-invalid={!!inlineError}
                    aria-describedby={inlineError ? "inline-url-error" : undefined}
                    className={cn(
                      "h-11 w-full rounded-[12px] border bg-[#11171f] px-3.5 text-sm text-paper placeholder:text-silver/60",
                      inlineError ? "border-danger/70" : "border-[#262c35]",
                      focusRing,
                    )}
                  />
                  {inlineError && (
                    <p id="inline-url-error" className="mt-1.5 text-[13px] text-danger">
                      {inlineError}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={submitInline}>
                    Add
                  </Button>
                  <Button variant="ghost" onClick={() => setInline(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {showLanguage && (
              <div className="mt-4 flex items-center gap-2">
                <Select
                  label="Language"
                  value={language}
                  onChange={(v) => {
                    setLanguage(v);
                    setShowLanguage(false);
                  }}
                  icon={<Languages className="size-4" aria-hidden />}
                  options={LANGUAGES}
                  className="w-[200px]"
                  selectClassName={pillSelect}
                />
                <Button variant="ghost" onClick={() => setShowLanguage(false)}>
                  Done
                </Button>
              </div>
            )}

            {(sources.length > 0 || pending.length > 0) && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Attached sources">
                {sources.map((s, i) => (
                  <li key={`${s.kind}-${"url" in s ? s.url : ""}-${i}`}>
                    <Chip
                      icon={sourceIcon(s)}
                      onRemove={() => setSources((prev) => prev.filter((_, j) => j !== i))}
                      removeLabel={`Remove ${sourceLabel(s)}`}
                      className="border-[#262c35] bg-[#11171f]"
                    >
                      {sourceLabel(s)}
                    </Chip>
                  </li>
                ))}
                {pending.map((p) => (
                  <li
                    key={p.id}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#262c35] bg-[#11171f] px-3.5 text-[13px] text-silver"
                  >
                    <Loader2 className="size-3.5 vd-spin text-coral" aria-hidden />
                    <span className="max-w-[140px] truncate">{p.name}</span>
                    <span className="tabular-nums text-coral">{Math.round(p.progress * 100)}%</span>
                    <span className="sr-only">uploading</span>
                  </li>
                ))}
              </ul>
            )}

            {hasVideoRef && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="inline-flex h-9 items-center gap-2 rounded-full border border-[#262c35] bg-[#11171f] px-3">
                  <Toggle checked={matchReference} onChange={setMatchReference} label="Match reference closely" size="sm" />
                  <span className="text-[13px] font-medium text-paper" aria-hidden>
                    Match reference closely
                  </span>
                </div>
                <p className="text-[12px] text-silver" aria-live="polite">
                  {matchReference
                    ? "Follows the reference's layouts, type, colors and pacing — with your content."
                    : "Borrows the reference's feel only."}
                </p>
              </div>
            )}

            {/* Chips + settings */}
            <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex flex-wrap items-center gap-2.5" aria-label="Add sources">
                <Menu
                  label="Add a source"
                  align="left"
                  triggerClassName={roundCls}
                  trigger={<Plus className="size-5" aria-hidden />}
                  items={[
                    { label: "YouTube link", icon: <FaYoutube />, onSelect: () => openInline("youtube") },
                    { label: "Upload video", icon: <Upload />, onSelect: () => videoInput.current?.click() },
                    { label: "Website", icon: <Globe />, onSelect: () => openInline("website") },
                    { label: "Add images", icon: <Images />, onSelect: () => imageInput.current?.click() },
                  ]}
                />
                <Menu
                  label="Add a reference video"
                  align="left"
                  triggerClassName={cn(chipCls, (inline === "youtube" || inline === "video_url") && "border-coral/60")}
                  trigger={
                    <>
                      <Film className="size-[18px]" aria-hidden />
                      Video
                    </>
                  }
                  items={[
                    { label: "YouTube link", icon: <FaYoutube />, onSelect: () => openInline("youtube") },
                    { label: "Upload a video", icon: <Upload />, onSelect: () => videoInput.current?.click() },
                    { label: "Paste a video link", icon: <Link2 />, onSelect: () => openInline("video_url") },
                  ]}
                />
                <button type="button" className={cn(chipCls, focusRing)} onClick={() => imageInput.current?.click()}>
                  <ImageIcon className="size-[18px]" aria-hidden />
                  Images
                </button>
                <button
                  type="button"
                  className={cn(chipCls, inline === "website" && "border-coral/60", focusRing)}
                  onClick={() => (inline === "website" ? setInline(null) : openInline("website"))}
                >
                  <Link2 className="size-[18px]" aria-hidden />
                  URL
                </button>
                <div className="flex items-center gap-1">
                  <Menu
                    label="AI voice"
                    align="left"
                    triggerClassName={cn(chipCls, voiceId !== "off" && "border-coral/60")}
                    trigger={
                      <>
                        <AudioLines className="size-[18px]" aria-hidden />
                        <span className="max-w-[140px] truncate">{selectedVoice ? selectedVoice.label : "AI Voice"}</span>
                      </>
                    }
                    items={voiceOptions.map((o) => ({
                      label: o.label,
                      icon: o.value === voiceId ? <Check /> : <span />,
                      onSelect: () => {
                        sample?.pause();
                        setSampling(false);
                        setVoiceId(o.value);
                      },
                    }))}
                  />
                  {selectedVoice?.previewUrl && (
                    <IconButton label={sampling ? "Stop voice sample" : `Play ${selectedVoice.label} sample`} onClick={toggleSample}>
                      {sampling ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    </IconButton>
                  )}
                </div>
                <Menu
                  label="More options"
                  align="left"
                  triggerClassName={roundCls}
                  trigger={<Ellipsis className="size-5" aria-hidden />}
                  header={
                    <p className="mb-1 border-b border-slate/40 px-2.5 pb-2 pt-1 text-[12.5px] text-silver">
                      <Sparkles className="mr-1 inline size-3.5 text-coral" aria-hidden />≈ {formatNumber(estimate)} credits for this video
                    </p>
                  }
                  items={[
                    { label: `Language: ${languageLabel}`, icon: <Languages />, onSelect: () => setShowLanguage(true) },
                    { label: music ? "Music: on" : "Music: off", icon: <Music />, onSelect: () => setMusic((m) => !m) },
                    {
                      label: useBrandKit ? "Brand kit: on" : "Brand kit: off",
                      icon: <Palette />,
                      onSelect: () => setUseBrandKit((v) => !v),
                    },
                    { label: "Browse templates", icon: <LayoutTemplate />, onSelect: () => navigate("/templates") },
                  ]}
                />
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    void onVideoFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    void onImageFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 xl:ml-auto">
                <Select
                  label="Format"
                  value={format}
                  onChange={(v) => setFormat(v as StudioFormat)}
                  icon={<Monitor className="size-[18px]" aria-hidden />}
                  options={FORMAT_OPTIONS.map((o) => ({ ...o, disabled: o.value === "match" && !hasVideoRef }))}
                  className="w-[122px]"
                  selectClassName={cn(pillSelect, "pl-10")}
                />
                <Select
                  label="Duration"
                  value={String(duration)}
                  onChange={(v) => setDuration(Number(v))}
                  icon={<Clock className="size-[18px]" aria-hidden />}
                  options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
                  className="w-[118px]"
                  selectClassName={cn(pillSelect, "pl-10")}
                />
                <button
                  type="submit"
                  disabled={!canGenerate}
                  title={`≈ ${formatNumber(estimate)} credits`}
                  className={cn(
                    "inline-flex h-[52px] min-w-[168px] items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#fca37d_0%,#f6874f_100%)] px-6 text-[17px] font-semibold text-[#2a1207] shadow-[0_10px_30px_-10px_rgb(246_135_79/0.9)] transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-90",
                    focusRing,
                  )}
                >
                  {submitting ? <Loader2 className="size-5 vd-spin" aria-hidden /> : null}
                  Generate
                  {!submitting && <ArrowRight className="size-[18px]" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-paper">
                {error.message}{" "}
                {error.payment && (
                  <Link to="/pricing" className="font-semibold text-coral underline-offset-2 hover:underline">
                    Get more credits
                  </Link>
                )}
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Recent videos */}
      <section aria-labelledby="recent-title" className="mt-10">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 id="recent-title" className="text-[21px] font-semibold tracking-[-0.01em] text-paper">
            Recent Videos
          </h2>
          <Link to="/videos" className={cn("rounded-md text-[16px] text-[#b5b8be] hover:text-paper", focusRing)}>
            View all →
          </Link>
        </div>

        {recent === null ? (
          <>
            <div className="vd-skeleton h-[clamp(200px,18.5vw,360px)] rounded-[14px]" aria-hidden />
            <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="vd-skeleton aspect-[163/84] rounded-[10px]" aria-hidden />
              ))}
            </div>
          </>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Your videos will show up here"
            body="Describe an idea above and hit Generate — your first video takes a few minutes."
          />
        ) : (
          <>
            <div className="h-[clamp(200px,18.5vw,360px)]">
              {selected && detail && detail.id === selected.id && detailRev ? (
                <PreviewPlayer
                  ctl={ctl}
                  jobId={detail.id}
                  revision={detailRev.revision}
                  width={detail.width}
                  height={detail.height}
                  audio={detail.audio}
                  poster={detailRev.thumbUrl ?? selected.thumbUrl}
                  variant="banner"
                  extra={
                    <Menu
                      label="Video options"
                      triggerClassName="flex size-9 items-center justify-center rounded-lg text-white hover:bg-white/15"
                      trigger={<EllipsisVertical className="size-5" aria-hidden />}
                      items={[{ label: "Open video", icon: <ArrowRight />, onSelect: () => navigate(videoHref(selected)) }]}
                    />
                  }
                />
              ) : selected ? (
                <Link
                  to={videoHref(selected)}
                  className={cn("group relative block size-full overflow-hidden rounded-[14px] border border-[#1c232c] bg-black", focusRing)}
                >
                  {selected.thumbUrl && (
                    <img src={selected.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" aria-hidden />
                  )}
                  <span className="absolute left-1/2 top-1/2 flex size-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/85 bg-black/30 backdrop-blur-sm transition-transform group-hover:scale-105">
                    {selected.stage && GENERATING_STAGES.has(selected.stage) ? (
                      <Loader2 className="size-7 vd-spin text-white" aria-hidden />
                    ) : (
                      <Play className="size-8 translate-x-0.5 fill-white text-white" aria-hidden />
                    )}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-3.5 pt-10 text-[15px] font-medium text-white">
                    {selected.title}
                    {selected.stage && GENERATING_STAGES.has(selected.stage) && (
                      <span className="ml-2 text-coral-400">
                        Generating{selected.progress != null ? ` · ${Math.round(selected.progress * 100)}%` : "…"}
                      </span>
                    )}
                  </span>
                </Link>
              ) : null}
            </div>

            <ul className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7" aria-label="Recent videos">
              {recent.map((c) => {
                const isSel = c.id === selected?.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-pressed={isSel}
                      aria-label={c.title}
                      className={cn(
                        "relative block aspect-[163/84] w-full overflow-hidden rounded-[10px] border bg-[#0c1219] transition-shadow",
                        isSel
                          ? "border-[#f4ab7e] shadow-[0_0_0_1px_#f4ab7e,0_0_20px_-4px_rgb(239_131_84/0.8)]"
                          : "border-[#1c232c] hover:border-[#3a414c]",
                        focusRing,
                      )}
                    >
                      {c.thumbUrl ? (
                        <img src={c.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                      ) : (
                        <span className="absolute inset-0 bg-[linear-gradient(135deg,#1b2430,#0c1219)]" />
                      )}
                      {c.stage && GENERATING_STAGES.has(c.stage) ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                          <Loader2 className="size-5 vd-spin text-coral" aria-hidden />
                        </span>
                      ) : (
                        c.duration != null && (
                          <span className="absolute bottom-1.5 right-2 text-[14px] font-medium tabular-nums text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
                            {formatTime(c.duration)}
                          </span>
                        )
                      )}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    promptRef.current?.focus();
                  }}
                  className={cn(
                    "flex aspect-[163/84] w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-[#18202a] bg-[#070d12] text-[14px] text-[#c9cbd1] transition-colors hover:border-[#3a414c] hover:text-paper",
                    focusRing,
                  )}
                >
                  <Plus className="size-6 stroke-[1.5]" aria-hidden />
                  New video
                </button>
              </li>
            </ul>
          </>
        )}
      </section>
    </AppShell>
  );
}

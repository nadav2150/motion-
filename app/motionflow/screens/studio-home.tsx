// /home — hero + the prompt card (the core v2 UX) + recent videos.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight,
  Clock,
  Ellipsis,
  FileVideo,
  Globe,
  ImageIcon,
  Images,
  Languages,
  Link2,
  Mic,
  Music,
  Palette,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  Upload,
  LayoutTemplate,
  Loader2,
  Sparkles,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import type { CreateStudioJobInput, StudioFormat, StudioSource, StudioTemplate, StudioVideoCard } from "../../lib/studio/types";
import { DURATION_OPTIONS } from "../../lib/studio/types";
import { api, ApiError, GENERATING_STAGES, MAX_REFERENCE_MB, type VoiceOption } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button, IconButton, focusRing } from "../ui/Button";
import { Chip, Select, Toggle } from "../ui/controls";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { VideoCard, VideoCardSkeleton, videoHref } from "../ui/VideoCard";
import { EmptyState } from "../ui/Card";
import { cn, formatNumber } from "../ui/format";
import { FALLBACK_TEMPLATES, SHOWCASE } from "../ui/showcase";
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
  const [template, setTemplate] = useState<StudioTemplate | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>(loaderVoices);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; payment?: boolean } | null>(null);
  const [recent, setRecent] = useState<StudioVideoCard[] | null>(null);
  const [sample, setSample] = useState<HTMLAudioElement | null>(null);
  const [sampling, setSampling] = useState(false);

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
        .listVideos({ filter: "all", limit: 4 })
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
        label: `${v.label}${v.accent ? ` · ${v.accent[0]!.toUpperCase()}${v.accent.slice(1)}` : ""}${v.gender ? ` ${v.gender}` : ""}`,
      })),
    ],
    [voices],
  );

  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      {/* Hero */}
      <section
        aria-labelledby="home-hero-title"
        className="relative overflow-hidden rounded-3xl border border-slate/35 bg-ink-800"
      >
        <img
          src={SHOWCASE.homeHero}
          alt=""
          className="absolute inset-0 size-full object-cover"
          fetchPriority="high"
          decoding="async"
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,rgb(31_34_46/0.72)_0%,rgb(31_34_46/0.92)_100%)] md:bg-[linear-gradient(90deg,rgb(31_34_46/0.96)_0%,rgb(31_34_46/0.82)_45%,rgb(31_34_46/0.25)_100%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-8 px-6 pb-14 pt-9 sm:px-10 sm:pb-16 sm:pt-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h1 id="home-hero-title" className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-paper sm:text-[40px]">
              Turn any idea into a stunning <span className="text-coral">motion video.</span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-silver sm:text-base">
              Describe what you want, add your content, and get a professional video in minutes.
            </p>
          </div>
          <Link
            to="/templates"
            aria-label="Watch example videos"
            className={cn(
              "group hidden size-24 shrink-0 items-center justify-center self-center rounded-full border border-white/30 bg-white/15 backdrop-blur-md transition-transform hover:scale-105 md:mr-10 md:flex",
              focusRing,
            )}
          >
            <span className="flex size-16 items-center justify-center rounded-full bg-coral shadow-[0_10px_40px_-8px_rgb(239_131_84/0.9)]">
              <Play className="size-7 translate-x-0.5 fill-white text-white" aria-hidden />
            </span>
          </Link>
        </div>
      </section>

      {/* Prompt card */}
      <section aria-label="Create a video" className="relative z-[1] -mt-6 px-0 sm:px-6">
        <form
          className="rounded-2xl border border-slate/50 bg-ink p-4 shadow-[var(--shadow-lift)] sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
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
          <label htmlFor="prompt" className="sr-only">
            Describe your video
          </label>
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void generate();
              }
            }}
            rows={3}
            maxLength={4000}
            placeholder="Describe your video… e.g. A cinematic video about exploring mountains at sunset"
            className="block min-h-[96px] w-full resize-y rounded-xl border-0 bg-transparent px-1.5 py-1 text-[16px] leading-relaxed text-paper placeholder:text-silver/60 focus-visible:outline-none"
          />

          {/* Source chips */}
          <div className="mt-2 flex flex-wrap items-center gap-2" aria-label="Add sources">
            <Menu
              label="Add a source"
              align="left"
              triggerClassName="size-9 rounded-full border border-slate/55 bg-ink-800 text-silver hover:bg-slate/35 hover:text-paper"
              trigger={<Plus className="size-4" aria-hidden />}
              items={[
                { label: "YouTube link", icon: <FaYoutube />, onSelect: () => openInline("youtube") },
                { label: "Website", icon: <Globe />, onSelect: () => openInline("website") },
                { label: "Upload video", icon: <Upload />, onSelect: () => videoInput.current?.click() },
                { label: "Add images", icon: <Images />, onSelect: () => imageInput.current?.click() },
              ]}
            />
            <Chip
              active={inline === "youtube"}
              icon={<FaYoutube className="size-4 text-[#ff0033]" aria-hidden />}
              onClick={() => (inline === "youtube" ? setInline(null) : openInline("youtube"))}
            >
              YouTube
            </Chip>
            <Chip
              active={inline === "website"}
              icon={<Globe className="size-4" aria-hidden />}
              onClick={() => (inline === "website" ? setInline(null) : openInline("website"))}
            >
              Website
            </Chip>
            <Chip icon={<Upload className="size-4" aria-hidden />} onClick={() => videoInput.current?.click()}>
              Upload
            </Chip>
            <Chip icon={<ImageIcon className="size-4" aria-hidden />} onClick={() => imageInput.current?.click()}>
              Images
            </Chip>
            <Menu
              label="More options"
              align="left"
              triggerClassName="size-9 rounded-full border border-slate/55 bg-ink-800 text-silver hover:bg-slate/35 hover:text-paper"
              trigger={<Ellipsis className="size-4" aria-hidden />}
              items={[
                { label: "Paste a video link", icon: <Link2 />, onSelect: () => openInline("video_url") },
                {
                  label: useBrandKit ? "Don't use my brand kit" : "Use my brand kit",
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

          {inline && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
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
                    "h-10 w-full rounded-xl border bg-ink-800 px-3.5 text-sm text-paper placeholder:text-silver/60",
                    inlineError ? "border-danger/70" : "border-slate/55",
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

          {(sources.length > 0 || pending.length > 0) && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Attached sources">
              {sources.map((s, i) => (
                <li key={`${s.kind}-${"url" in s ? s.url : ""}-${i}`}>
                  <Chip
                    icon={sourceIcon(s)}
                    onRemove={() => setSources((prev) => prev.filter((_, j) => j !== i))}
                    removeLabel={`Remove ${sourceLabel(s)}`}
                    className="bg-ink-800"
                  >
                    {sourceLabel(s)}
                  </Chip>
                </li>
              ))}
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate/55 bg-ink-800 px-3.5 text-[13px] text-silver"
                >
                  <Loader2 className="size-3.5 vd-spin text-coral" aria-hidden />
                  <span className="max-w-[140px] truncate">{p.name}</span>
                  <span className="tabular-nums text-coral">{Math.round(p.progress * 100)}%</span>
                  <span className="sr-only">uploading</span>
                </li>
              ))}
            </ul>
          )}

          <div className="my-4 h-px bg-slate/35" />

          {/* Controls row */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center">
              <Select
                label="Duration"
                value={String(duration)}
                onChange={(v) => setDuration(Number(v))}
                icon={<Clock className="size-4" aria-hidden />}
                options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
                className="sm:w-[104px]"
              />
              <Select
                label="Format"
                value={format}
                onChange={(v) => setFormat(v as StudioFormat)}
                icon={<RectangleHorizontal className="size-4" aria-hidden />}
                options={FORMAT_OPTIONS.map((o) => ({
                  ...o,
                  disabled: o.value === "match" && !hasVideoRef,
                  label: o.value === "match" && !hasVideoRef ? "Match reference (add a video)" : o.label,
                }))}
                className="sm:w-[124px]"
              />
              <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
                <Select
                  label="AI Voice"
                  value={voiceId}
                  onChange={(v) => {
                    sample?.pause();
                    setSampling(false);
                    setVoiceId(v);
                  }}
                  icon={<Mic className="size-4" aria-hidden />}
                  options={voiceOptions}
                  className="min-w-0 flex-1 sm:w-[190px] sm:flex-none"
                />
                {selectedVoice?.previewUrl && (
                  <IconButton label={sampling ? "Stop voice sample" : `Play ${selectedVoice.label} sample`} onClick={toggleSample}>
                    {sampling ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  </IconButton>
                )}
              </div>
              <Select
                label="Language"
                value={language}
                onChange={setLanguage}
                icon={<Languages className="size-4" aria-hidden />}
                options={LANGUAGES}
                className="sm:w-[140px]"
              />
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate/55 bg-ink-800 px-3">
                <Music className="size-4 text-silver" aria-hidden />
                <Toggle checked={music} onChange={setMusic} label="Background music" size="sm" />
                <span className="text-[13px] font-medium text-paper">Music {music ? "on" : "off"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 xl:ml-auto">
              <p className="text-[13px] text-silver" aria-live="polite">
                <Sparkles className="mr-1 inline size-3.5 text-coral" aria-hidden />≈ {formatNumber(estimate)} credits
              </p>
              <Button
                type="submit"
                size="lg"
                disabled={!canGenerate}
                loading={submitting}
                iconRight={!submitting ? <ArrowRight className="size-4" aria-hidden /> : undefined}
              >
                Generate
              </Button>
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
        </form>
      </section>

      {/* Recent videos */}
      <section aria-labelledby="recent-title" className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-title" className="text-lg font-semibold text-paper">
            Recent videos
          </h2>
          <Link to="/videos" className={cn("rounded-md text-sm font-medium text-silver hover:text-paper", focusRing)}>
            View all →
          </Link>
        </div>
        {recent === null ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="Your videos will show up here"
            body="Describe an idea above and hit Generate — your first video takes a few minutes."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((c) => (
              <VideoCard key={c.id} card={c} href={videoHref(c)} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

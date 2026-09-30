// /brand — the user's brand kit (logo, colors, fonts, default voice, style),
// autosaved through PUT /api/brand-kit. Every generation uses it by default.

import { useEffect, useRef, useState } from "react";
import { Check, Globe, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import type { BrandKit, StudioVideoCard } from "../../lib/studio/types";
import { api, type VoiceOption } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button } from "../ui/Button";
import { Select, Tabs, TextField } from "../ui/controls";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "../ui/Card";
import { toast } from "../ui/Toast";
import { VideoCard, videoHref } from "../ui/VideoCard";
import { cn } from "../ui/format";
import { focusRing } from "../ui/Button";

type TabKey = "kit" | "logos" | "colors" | "fonts" | "voice" | "style" | "examples";
const TABS: { key: TabKey; label: string }[] = [
  { key: "kit", label: "Brand Kit" },
  { key: "logos", label: "Logos" },
  { key: "colors", label: "Colors" },
  { key: "fonts", label: "Fonts" },
  { key: "voice", label: "Voice" },
  { key: "style", label: "Style" },
  { key: "examples", label: "Examples" },
];

export const FONT_CHOICES = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "DM Sans",
  "Space Grotesk",
  "Manrope",
  "Outfit",
  "Sora",
  "Plus Jakarta Sans",
  "Bebas Neue",
  "Oswald",
  "Raleway",
  "Lora",
  "Merriweather",
  "Rubik",
  "Heebo",
  "Assistant",
  "Work Sans",
  "Archivo",
];

const COLOR_LABELS = ["Primary", "Secondary", "Accent"];
const EMPTY_KIT: BrandKit = {
  name: null,
  logoUrl: null,
  colors: [],
  headingFont: "Inter",
  bodyFont: "Inter",
  voiceId: null,
  styleNotes: null,
  websiteUrl: null,
};

function useGoogleFonts(families: (string | null)[]) {
  const key = families.filter(Boolean).join("|");
  useEffect(() => {
    if (!key) return;
    const href = `https://fonts.googleapis.com/css2?${key
      .split("|")
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`)
      .join("&")}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
  }, [key]);
}

export function BrandScreen({
  user,
  planTier,
  credits,
  voices,
}: {
  user: ShellUser;
  planTier: string | null;
  credits: number | null;
  voices: VoiceOption[];
}) {
  const [tab, setTab] = useState<TabKey>("kit");
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [logoProgress, setLogoProgress] = useState<number | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [examples, setExamples] = useState<StudioVideoCard[] | null>(null);
  const dirty = useRef(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);

  useGoogleFonts([kit?.headingFont ?? null, kit?.bodyFont ?? null]);

  useEffect(() => {
    api
      .getBrandKit()
      .then((k) => {
        setKit({ ...EMPTY_KIT, ...k, colors: k.colors ?? [] });
        setSiteUrl(k.websiteUrl ?? "");
      })
      .catch((e) => {
        setKit(EMPTY_KIT);
        setLoadError(e instanceof Error ? e.message : "Couldn't load your brand kit.");
      });
  }, []);

  useEffect(() => {
    if (tab !== "examples" || examples) return;
    api
      .listVideos({ filter: "ready", limit: 6 })
      .then((r) => setExamples(r.items))
      .catch(() => setExamples([]));
  }, [tab, examples]);

  // Autosave (debounced).
  useEffect(() => {
    if (!kit || !dirty.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        await api.putBrandKit(kit);
        dirty.current = false;
        setSaveState("saved");
        toast("Brand kit saved");
      } catch (e) {
        setSaveState("error");
        toast(e instanceof Error ? e.message : "Couldn't save your brand kit", "error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [kit]);

  const update = (patch: Partial<BrandKit>) => {
    dirty.current = true;
    setKit((k) => (k ? { ...k, ...patch } : k));
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Upload a PNG, JPG, SVG or WebP image.", "error");
    if (file.size > 5 * 1024 * 1024) return toast("Logos must be 5 MB or smaller.", "error");
    setLogoProgress(0);
    try {
      const a = await api.uploadAsset(file, setLogoProgress, "logo");
      update({ logoUrl: a.url });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setLogoProgress(null);
    }
  };

  const importSite = async () => {
    const raw = siteUrl.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setImporting(true);
    try {
      const s = await api.scrapeBrand(url);
      const colors = Array.from(new Set([...(s.palette ?? [])].map((c) => c.toLowerCase()))).slice(0, 6);
      update({
        websiteUrl: url,
        colors: colors.length ? colors : kit?.colors ?? [],
        logoUrl: s.logoUrl ?? kit?.logoUrl ?? null,
        headingFont: s.headlineFont?.split(",")[0]?.replace(/["']/g, "").trim() || kit?.headingFont || null,
        bodyFont: s.bodyFont?.split(",")[0]?.replace(/["']/g, "").trim() || kit?.bodyFont || null,
        name: kit?.name || s.pageTitle?.split(/[—|\-–]/)[0]?.trim() || null,
      });
      toast("Imported colors and fonts from your website");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that website", "error");
    } finally {
      setImporting(false);
    }
  };

  const fontOptions = (current: string | null) =>
    Array.from(new Set([...(current ? [current] : []), ...FONT_CHOICES])).map((f) => ({ value: f, label: f }));
  const voice = voices.find((v) => v.id === kit?.voiceId);
  const show = (k: TabKey) => tab === "kit" || tab === k;

  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      <PageHeader
        title="Brand"
        subtitle="Keep your brand consistent in every video."
        action={
          <span className="text-sm text-silver" aria-live="polite">
            {saveState === "saving" && (
              <>
                <Loader2 className="mr-1.5 inline size-4 vd-spin" aria-hidden />
                Saving…
              </>
            )}
            {saveState === "saved" && (
              <>
                <Check className="mr-1.5 inline size-4 text-ready" aria-hidden />
                All changes saved
              </>
            )}
          </span>
        }
      />
      <Tabs label="Brand sections" items={TABS} value={tab} onChange={setTab} className="mb-6" />

      {loadError && (
        <p role="alert" className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {loadError}
        </p>
      )}

      {!kit ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : tab === "examples" ? (
        examples === null ? (
          <Skeleton className="h-48" />
        ) : examples.length === 0 ? (
          <EmptyState title="No examples yet" body="Videos you make with your brand kit will appear here." />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((c) => (
              <VideoCard key={c.id} card={c} href={videoHref(c)} />
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {tab === "kit" && (
            <Card className="p-5 sm:p-6 lg:col-span-2">
              <CardHeader title="Import from your website" subtitle="We'll pull your colors, fonts and logo automatically." />
              <form
                className="flex flex-col gap-2.5 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void importSite();
                }}
              >
                <TextField
                  label="Website address"
                  hideLabel
                  value={siteUrl}
                  onChange={setSiteUrl}
                  placeholder="https://yourcompany.com"
                  icon={<Globe className="size-4" aria-hidden />}
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" loading={importing} disabled={!siteUrl.trim()}>
                  Import brand
                </Button>
              </form>
            </Card>
          )}

          {show("logos") && (
            <Card className="p-5 sm:p-6">
              <CardHeader title="Brand Identity" subtitle="Your name and logo appear in intros and end cards." />
              <TextField label="Brand name" value={kit.name ?? ""} onChange={(v) => update({ name: v || null })} placeholder="Your brand" />
              <div className="mt-5 flex items-center gap-5">
                <div
                  className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate/50 bg-[conic-gradient(#2d3142_25%,#262a38_0_50%,#2d3142_0_75%,#262a38_0)] bg-[length:16px_16px]"
                  aria-label={kit.logoUrl ? "Current logo" : "No logo yet"}
                  role="img"
                >
                  {kit.logoUrl ? (
                    <img src={kit.logoUrl} alt="" className="max-h-[80%] max-w-[80%] object-contain" />
                  ) : logoProgress !== null ? (
                    <span className="text-sm font-semibold tabular-nums text-coral">{Math.round(logoProgress * 100)}%</span>
                  ) : (
                    <ImagePlus className="size-7 text-silver" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => logoInput.current?.click()} loading={logoProgress !== null}>
                    Upload logo
                  </Button>
                  <Button variant="secondary" onClick={() => update({ logoUrl: null })} disabled={!kit.logoUrl} icon={<Trash2 className="size-4" aria-hidden />}>
                    Remove
                  </Button>
                </div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    void onLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="mt-3 text-xs text-silver">PNG or SVG with a transparent background works best. Max 5 MB.</p>
            </Card>
          )}

          {show("colors") && (
            <Card className="p-5 sm:p-6">
              <CardHeader title="Brand Colors" subtitle="Used for backgrounds, text highlights and accents." />
              <ul className="flex flex-wrap gap-5" aria-label="Brand colors">
                {kit.colors.map((c, i) => (
                  <li key={`${c}-${i}`} className="group relative flex flex-col items-center gap-2">
                    <label className="relative block cursor-pointer">
                      <span className="sr-only">Change {COLOR_LABELS[i] ?? `color ${i + 1}`}</span>
                      <span
                        className="block size-14 rounded-full border-2 border-white/15 shadow-[0_6px_20px_-8px_rgb(0_0_0/0.8)]"
                        style={{ background: c }}
                      />
                      <input
                        type="color"
                        value={/^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"}
                        onChange={(e) => update({ colors: kit.colors.map((x, j) => (j === i ? e.target.value : x)) })}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remove ${c}`}
                      onClick={() => update({ colors: kit.colors.filter((_, j) => j !== i) })}
                      className={cn(
                        "absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink-800 text-silver opacity-0 shadow ring-1 ring-slate/60 transition-opacity hover:text-paper group-hover:opacity-100 focus-visible:opacity-100",
                        focusRing,
                      )}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                    <span className="text-xs font-medium text-paper">{COLOR_LABELS[i] ?? `Color ${i + 1}`}</span>
                    <span className="-mt-1.5 text-[11px] uppercase tabular-nums text-silver">{c}</span>
                  </li>
                ))}
                {kit.colors.length < 8 && (
                  <li className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => colorInput.current?.click()}
                      aria-label="Add a color"
                      className={cn(
                        "flex size-14 items-center justify-center rounded-full border-2 border-dashed border-slate text-silver hover:border-coral hover:text-coral",
                        focusRing,
                      )}
                    >
                      <Plus className="size-5" aria-hidden />
                    </button>
                    <span className="text-xs text-silver">Add</span>
                    <input
                      ref={colorInput}
                      type="color"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      defaultValue="#ef8354"
                      onChange={(e) => update({ colors: [...kit.colors, e.target.value] })}
                    />
                  </li>
                )}
              </ul>
            </Card>
          )}

          {show("fonts") && (
            <Card className="p-5 sm:p-6">
              <CardHeader title="Fonts" subtitle="Headings and body text in every video." />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Select
                    label="Heading font"
                    hideLabel={false}
                    value={kit.headingFont ?? "Inter"}
                    onChange={(v) => update({ headingFont: v })}
                    options={fontOptions(kit.headingFont)}
                  />
                  <p className="mt-3 truncate text-2xl font-bold text-paper" style={{ fontFamily: `"${kit.headingFont ?? "Inter"}", sans-serif` }}>
                    Ideas move
                  </p>
                </div>
                <div>
                  <Select
                    label="Body font"
                    hideLabel={false}
                    value={kit.bodyFont ?? "Inter"}
                    onChange={(v) => update({ bodyFont: v })}
                    options={fontOptions(kit.bodyFont)}
                  />
                  <p className="mt-3 text-sm text-silver" style={{ fontFamily: `"${kit.bodyFont ?? "Inter"}", sans-serif` }}>
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {show("voice") && (
            <Card className="p-5 sm:p-6">
              <CardHeader title="Voice" subtitle="The default AI voice for your voiceovers." />
              <div className="flex items-center gap-4">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate to-ink text-base font-bold text-paper ring-2 ring-coral/60"
                  aria-hidden
                >
                  {voice?.label?.[0] ?? "–"}
                </span>
                <div className="min-w-0 flex-1">
                  <Select
                    label="Default voice"
                    value={kit.voiceId ?? "none"}
                    onChange={(v) => update({ voiceId: v === "none" ? null : v })}
                    options={[{ value: "none", label: "No default voice" }, ...voices.map((v) => ({ value: v.id, label: v.label }))]}
                  />
                  <p className="mt-1.5 truncate text-xs text-silver">
                    {voice ? `Natural Voice · ${voice.tone ? voice.tone.split(/[—,]/).slice(0, 2).join(",").trim() : "Professional, friendly"}` : "Pick a voice per video on Home"}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {show("style") && (
            <Card className={cn("p-5 sm:p-6", tab === "kit" && "lg:col-span-2")}>
              <CardHeader title="Style" subtitle="Tone, mood and anything Videly should always (or never) do." />
              <label htmlFor="style-notes" className="sr-only">
                Style notes
              </label>
              <textarea
                id="style-notes"
                rows={4}
                maxLength={1500}
                value={kit.styleNotes ?? ""}
                onChange={(e) => update({ styleNotes: e.target.value || null })}
                placeholder="e.g. Confident and warm. Lots of negative space. Never use neon colors."
                className={cn(
                  "w-full resize-y rounded-xl border border-slate/55 bg-ink-800 px-3.5 py-3 text-sm text-paper placeholder:text-silver/60",
                  focusRing,
                )}
              />
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

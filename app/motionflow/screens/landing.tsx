// Public landing page "/" (Videly v2). SEO meta + JSON-LD live in
// app/routes/landing.tsx. Every external image URL is in ui/showcase.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  LayoutTemplate,
  Maximize,
  Mic,
  Palette,
  PenLine,
  Play,
  Plus,
  RectangleHorizontal,
  Repeat,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import type { StudioTemplate, TemplateCategory } from "../../lib/studio/types";
import { api } from "../ui/api";
import { ButtonLink, focusRing } from "../ui/Button";
import { Tabs } from "../ui/controls";
import { LogoMark } from "../ui/Logo";
import { MarketingFooter, MarketingHeader } from "../ui/marketing";
import { TemplateCard } from "../ui/TemplateCard";
import { cn, formatClock } from "../ui/format";
import {
  FALLBACK_TEMPLATES,
  SHOWCASE,
  STATS,
  TEMPLATE_CATEGORY_LABELS,
  TESTIMONIALS,
  TRUSTED_LOGOS,
} from "../ui/showcase";

// ------------------------------------------------------------------ helpers

function Eyebrow({ children, pill }: { children: ReactNode; pill?: boolean }) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.16em] text-coral",
        pill && "inline-flex items-center gap-2 rounded-full border border-slate/70 bg-ink/60 px-3.5 py-1.5",
      )}
    >
      {pill && <Sparkles className="size-3.5" aria-hidden />}
      {children}
    </p>
  );
}

function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-2.5", className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2 text-sm text-silver">
          <span className="flex size-5 items-center justify-center rounded-full bg-coral/15 text-coral">
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1240px] scroll-mt-24 px-4 py-16 sm:px-6 lg:py-24", className)}>
      {children}
    </section>
  );
}

// Plays only while on screen; stays on the poster otherwise (and when there
// is no video yet — SHOWCASE.* video URLs are null until real demos exist).
function ShowcaseMedia({
  video,
  poster,
  alt,
  priority,
  className,
}: {
  video: string | null;
  poster: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [video]);
  if (!video) {
    return (
      <img
        src={poster}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={cn("absolute inset-0 size-full object-cover", className)}
      />
    );
  }
  return (
    <video
      ref={ref}
      src={video}
      poster={poster}
      preload="none"
      muted
      loop
      playsInline
      aria-label={alt}
      className={cn("absolute inset-0 size-full object-cover", className)}
    />
  );
}

function HeadlineOverlay({ small }: { small?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center bg-gradient-to-r from-black/45 via-black/10 to-transparent px-[7%]">
      <p
        className={cn(
          "font-extrabold leading-[1.02] tracking-[-0.03em] text-white drop-shadow-[0_4px_24px_rgb(0_0_0/0.45)]",
          small ? "text-[clamp(18px,3.4vw,30px)]" : "text-[clamp(22px,4vw,44px)]",
        )}
      >
        Ideas Move
        <br />
        <span className="text-coral">the World.</span>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ hero mock

function ProductMock() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate/50 bg-ink shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.03)]">
      {/* window chrome */}
      <div className="flex h-9 items-center gap-1.5 border-b border-slate/40 bg-ink-800 px-3.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#f07167]" />
        <span className="size-2.5 rounded-full bg-[#f4d35e]" />
        <span className="size-2.5 rounded-full bg-[#6fcf97]" />
        <span className="ml-3 hidden h-5 flex-1 rounded-md bg-ink-900/70 sm:block" />
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:p-4">
        <div className="min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-900">
            <ShowcaseMedia video={SHOWCASE.heroVideo} poster={SHOWCASE.heroPoster} alt="A Videly video: mountains at sunset" priority />
            <HeadlineOverlay small />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6" aria-hidden>
              <div className="h-1 rounded-full bg-white/25">
                <div className="relative h-full w-[38%] rounded-full bg-coral">
                  <span className="absolute -right-1.5 -top-1 size-3 rounded-full border-2 border-coral bg-white" />
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-white">
                <Play className="size-3.5 fill-current" />
                <span className="text-[10px] font-medium tabular-nums">0:11 / 0:30</span>
                <Volume2 className="ml-auto size-3.5" />
                <Repeat className="size-3.5" />
                <Maximize className="size-3.5" />
              </div>
            </div>
          </div>
          {/* timeline strip */}
          <div className="relative mt-2.5 flex h-10 overflow-hidden rounded-lg border border-slate/40" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-full flex-1 border-r border-ink-900 bg-cover"
                style={{ backgroundImage: `url(${SHOWCASE.heroPosterSmall})`, backgroundPosition: `${(i / 7) * 100}% 50%` }}
              />
            ))}
            <span className="absolute inset-y-0 left-[38%] w-0.5 bg-coral" />
          </div>
        </div>
        {/* Generate panel */}
        <div className="hidden flex-col gap-2.5 rounded-xl border border-slate/40 bg-ink-800 p-3 sm:flex" aria-hidden>
          <p className="text-[13px] font-semibold text-paper">Generate</p>
          <div className="rounded-lg border border-slate/50 bg-ink-900/60 p-2.5 text-[11.5px] leading-snug text-silver">
            A cinematic video about exploring mountains at sunset
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate/50 px-2.5 py-2 text-[11.5px] text-paper">
            <span className="flex items-center gap-1.5">
              <RectangleHorizontal className="size-3.5 text-silver" /> 16:9
            </span>
            <ChevronDown className="size-3.5 text-silver" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate/50 px-2.5 py-2 text-[11.5px] text-paper">
            <span className="flex items-center gap-1.5">
              <Mic className="size-3.5 text-silver" /> AI Voice
            </span>
            <span className="relative h-4 w-7 rounded-full bg-coral">
              <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-white" />
            </span>
          </div>
          <div className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-lg bg-coral text-[12.5px] font-semibold text-white">
            Generate <ArrowRight className="size-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sections

// Trusted-by strip. Only real customers' logos with permission; otherwise real
// measured stats; otherwise nothing (see showcase.ts).
function TrustedBy() {
  if (TRUSTED_LOGOS.length > 0) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-silver">Trusted by teams at</p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {TRUSTED_LOGOS.map((l) => (
            <li key={l.name}>
              <img src={l.src} alt={l.name} loading="lazy" className="h-7 w-auto opacity-70 grayscale" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (STATS.length > 0) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
        <dl className="grid grid-cols-2 gap-6 rounded-2xl border border-slate/40 bg-ink/60 p-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <dt className="text-sm text-silver">{s.label}</dt>
              <dd className="mt-1 text-2xl font-bold text-paper">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return null;
}

const FEATURES = [
  { icon: Wand2, title: "AI-Powered Creation", body: "Turn text, images or ideas into professional videos." },
  { icon: LayoutTemplate, title: "Stunning Templates", body: "Choose from a growing library of modern, cinematic templates." },
  { icon: Palette, title: "Your Brand, Consistent", body: "Keep your logo, colors, fonts and style in every video." },
  { icon: Share2, title: "Export Anywhere", body: "Optimized for social media, ads, and presentations." },
];

function Features() {
  return (
    <Section id="features" className="py-12 lg:py-16">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-2xl border border-slate/40 bg-ink/70 p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-coral/15 text-coral">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-semibold text-paper">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-silver">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CreateFaster({ ctaHref }: { ctaHref: string }) {
  const [active, setActive] = useState(0);
  const demo = SHOWCASE.demos[active]!;
  return (
    <Section>
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="min-w-0">
          <Eyebrow>Create faster</Eyebrow>
          <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[40px]">
            From idea to video in minutes
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-silver">
            Write a sentence, drop in a link or a few images, and Videly plans the story, designs every scene, adds voice and music,
            and hands you a video you can edit just by asking.
          </p>
          <ButtonLink to={ctaHref} size="lg" className="mt-7" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Try it now
          </ButtonLink>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate/40 bg-ink-800">
            <ShowcaseMedia key={demo.id} video={demo.video} poster={demo.poster} alt={`Example video: ${demo.title}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" aria-hidden />
            <p className="absolute bottom-4 left-5 right-5 text-lg font-bold text-white sm:text-2xl">{demo.title}</p>
            <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-coral/95 shadow-lg" aria-hidden>
              <Play className="size-6 translate-x-0.5 fill-white text-white" />
            </span>
          </div>
          <div role="tablist" aria-label="Example videos" className="vd-noscrollbar flex gap-2.5 overflow-x-auto sm:w-[112px] sm:flex-col sm:overflow-visible">
            {SHOWCASE.demos.map((d, i) => (
              <button
                key={d.id}
                role="tab"
                type="button"
                aria-selected={i === active}
                aria-label={d.title}
                onClick={() => setActive(i)}
                className={cn(
                  "relative aspect-video w-[110px] shrink-0 overflow-hidden rounded-xl border-2 transition-colors sm:w-full",
                  i === active ? "border-coral" : "border-transparent opacity-70 hover:opacity-100",
                  focusRing,
                )}
              >
                <img src={d.poster.replace("w=1200", "w=240")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function useShowcaseTemplates(): StudioTemplate[] {
  const [items, setItems] = useState<StudioTemplate[]>(FALLBACK_TEMPLATES);
  useEffect(() => {
    api
      .listTemplates()
      .then((r) => r.items.length >= 6 && setItems(r.items))
      .catch(() => {});
  }, []);
  return items;
}

function TemplatesRow({ templates, templateHref }: { templates: StudioTemplate[]; templateHref: (t: StudioTemplate) => string }) {
  return (
    <Section id="templates">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Professional templates</Eyebrow>
          <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[40px]">
            Start with a template, make it yours
          </h2>
          <p className="mt-3 max-w-xl text-base text-silver">
            Every template is a proven starting point — swap in your words, images and brand, and Videly rebuilds the video around them.
          </p>
        </div>
        <Link to="/templates" className={cn("rounded-md text-sm font-semibold text-coral hover:text-coral-400", focusRing)}>
          Browse all templates →
        </Link>
      </div>
      <ul className="vd-scroll-x -mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
        {templates.slice(0, 6).map((t) => (
          <li key={t.id} className="w-[260px] shrink-0 snap-start sm:w-[300px]">
            <TemplateCard t={t} href={templateHref(t)} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BrandSection({ ctaHref }: { ctaHref: string }) {
  return (
    <Section>
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="lg:order-2">
          <Eyebrow>Your brand, always on</Eyebrow>
          <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[40px]">Keep your brand consistent</h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-silver">
            Set your logo, colors, fonts and voice once — or import them from your website. Every video you make uses them automatically.
          </p>
          <ButtonLink to={ctaHref} size="lg" className="mt-7" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Set up your brand
          </ButtonLink>
        </div>
        <div className="grid items-center gap-4 sm:grid-cols-[0.9fr_1.1fr] lg:order-1" aria-hidden>
          <div className="rounded-2xl border border-slate/45 bg-ink p-5 shadow-[var(--shadow-lift)]">
            <p className="text-sm font-semibold text-paper">Brand Kit</p>
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-slate/40 bg-ink-800 p-3">
              <LogoMark size={30} />
              <span className="text-base font-bold text-paper">Videly</span>
            </div>
            <p className="mt-4 text-xs font-medium text-silver">Colors</p>
            <div className="mt-2 flex items-center gap-2">
              {["#ef8354", "#4f5d75", "#2d3142", "#bfc0c0"].map((c) => (
                <span key={c} className="size-8 rounded-full border-2 border-white/10" style={{ background: c }} />
              ))}
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-dashed border-slate text-silver">
                <Plus className="size-3.5" />
              </span>
            </div>
            <p className="mt-4 text-xs font-medium text-silver">Fonts</p>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-slate/50 bg-ink-800 px-3 py-2 text-sm text-paper">
              Inter <ChevronDown className="size-4 text-silver" />
            </div>
          </div>
          <div>
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate/40">
              <img src={SHOWCASE.demos[0]!.poster} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              <HeadlineOverlay small />
              <span className="absolute right-3 top-3">
                <LogoMark size={22} />
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-paper">Ideas Move the World.</p>
            <p className="text-xs text-silver">16:9 · 00:30 · your brand applied</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

const STEPS = [
  { icon: PenLine, title: "Describe your idea", body: "Type a prompt or upload your content (images, scripts, links)." },
  { icon: SlidersHorizontal, title: "Customize", body: "Choose a template, edit scenes, add your brand, music and voice." },
  { icon: Download, title: "Export and share", body: "Download and publish anywhere — in the perfect format." },
];

function HowItWorks() {
  return (
    <Section id="how-it-works">
      <div className="text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[40px]">Create a video in 3 simple steps</h2>
      </div>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="relative rounded-2xl border border-slate/40 bg-ink/70 p-7">
            <span className="absolute right-6 top-6 text-5xl font-extrabold text-slate/40" aria-hidden>
              {i + 1}
            </span>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-coral text-white shadow-[0_10px_30px_-10px_rgb(239_131_84/0.8)]">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-5 text-lg font-semibold text-paper">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-silver">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

type Cat = TemplateCategory | "all";
const CAT_TABS: { key: Cat; label: string }[] = [
  { key: "all", label: "All" },
  ...(Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[]).map((k) => ({ key: k as Cat, label: TEMPLATE_CATEGORY_LABELS[k] })),
];

function UseCases({ templates, templateHref }: { templates: StudioTemplate[]; templateHref: (t: StudioTemplate) => string }) {
  const [cat, setCat] = useState<Cat>("all");
  const items = templates.filter((t) => cat === "all" || t.category === cat).slice(0, 6);
  return (
    <Section>
      <div className="text-center">
        <Eyebrow>Perfect for every creator</Eyebrow>
        <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[40px]">One tool. Endless possibilities.</h2>
      </div>
      <div className="mt-8 flex justify-center">
        <Tabs label="Video categories" items={CAT_TABS} value={cat} onChange={setCat} />
      </div>
      {items.length === 0 ? (
        <p className="mt-10 text-center text-sm text-silver">Examples for this category are coming soon.</p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <li key={t.id}>
              <Link to={templateHref(t)} className={cn("group block rounded-2xl", focusRing)}>
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate/40 bg-ink-800">
                  {t.posterUrl && (
                    <img
                      src={t.posterUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
                  <span className="absolute left-4 top-4 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                    {TEMPLATE_CATEGORY_LABELS[t.category]}
                  </span>
                  <span className="absolute bottom-4 right-4 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                    {formatClock(t.duration)}
                  </span>
                  <p className="absolute bottom-4 left-4 right-16 truncate text-lg font-bold text-white">{t.name}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// Real quotes with the person's consent only — never invented. Hidden while
// TESTIMONIALS is empty (plan: show once at least 3 real quotes exist).
function Testimonials() {
  if (TESTIMONIALS.length < 3) return null;
  return (
    <Section>
      <div className="text-center">
        <Eyebrow>Loved by creators</Eyebrow>
        <h2 className="mt-3 text-[32px] font-bold tracking-[-0.025em] text-paper sm:text-[40px]">What our users say</h2>
      </div>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <li key={t.name} className="rounded-2xl border border-slate/40 bg-ink/70 p-6">
            <blockquote className="text-[15px] leading-relaxed text-paper">“{t.quote}”</blockquote>
            <div className="mt-5 flex items-center gap-3">
              {t.avatar && <img src={t.avatar} alt="" loading="lazy" className="size-10 rounded-full object-cover" />}
              <div>
                <p className="text-sm font-semibold text-paper">{t.name}</p>
                {t.role && <p className="text-xs text-silver">{t.role}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate/40">
        <img src={SHOWCASE.ctaBackground} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(24_26_36/0.94)_0%,rgb(24_26_36/0.75)_55%,rgb(24_26_36/0.35)_100%)]" aria-hidden />
        <div className="relative px-6 py-14 sm:px-12 sm:py-20">
          <h2 className="max-w-xl text-[30px] font-bold leading-tight tracking-[-0.025em] text-paper sm:text-[44px]">
            Ready to bring your ideas to life?
          </h2>
          <p className="mt-4 max-w-lg text-base text-silver sm:text-lg">
            Join creators and businesses using Videly to make stunning videos, faster.
          </p>
          <ButtonLink to={ctaHref} size="lg" className="mt-8" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Get started for free
          </ButtonLink>
          <CheckList className="mt-7" items={["No credit card required", "Professional templates", "Export in high quality"]} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

export const LandingScreen = ({
  isAuthed = false,
}: {
  isAuthed?: boolean;
  onCta?: () => void;
  onSignIn?: () => void;
}) => {
  const ctaHref = isAuthed ? "/home" : "/register";
  const templates = useShowcaseTemplates();
  const templateHref = (t: StudioTemplate) =>
    isAuthed ? `/home?template=${encodeURIComponent(t.id)}` : "/register";

  return (
    <div className="vd-root min-h-screen overflow-x-hidden">
      <a href="#main" className="sr-only z-[200] rounded-lg bg-coral px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <MarketingHeader isAuthed={isAuthed} />
      <main id="main">
        {/* Hero */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_60%_at_75%_20%,rgb(239_131_84/0.16),transparent_70%),radial-gradient(50%_50%_at_10%_10%,rgb(79_93_117/0.35),transparent_70%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:pb-16 lg:pt-20">
            <div>
              <Eyebrow pill>AI-powered video creation</Eyebrow>
              <h1 className="mt-6 text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-paper sm:text-[56px] lg:text-[62px]">
                Turn any idea into a stunning <span className="text-coral">motion video.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-silver">
                Describe what you want, add your content, and get a professional video in minutes.
              </p>
              <ButtonLink to={ctaHref} size="lg" className="mt-8 h-[52px] px-7 text-base" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                {isAuthed ? "Open the app" : "Create your first video"}
              </ButtonLink>
              <CheckList className="mt-8" items={["No editing skills required", "Professional templates", "AI voice & music"]} />
            </div>
            <ProductMock />
          </div>
        </div>

        <TrustedBy />
        <Features />
        <CreateFaster ctaHref={ctaHref} />
        <TemplatesRow templates={templates} templateHref={templateHref} />
        <BrandSection ctaHref={isAuthed ? "/brand" : ctaHref} />
        <HowItWorks />
        <UseCases templates={templates} templateHref={templateHref} />
        <Testimonials />
        <FinalCta ctaHref={ctaHref} />
      </main>
      <MarketingFooter />
    </div>
  );
};

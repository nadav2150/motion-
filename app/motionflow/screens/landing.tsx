// Public landing page "/" (Videly v2). SEO meta + JSON-LD live in
// app/routes/landing.tsx. Layout matches the Sep 30 marketing mockup; its
// imagery is AI-generated and lives in public/landing/ (see LANDING_IMG).

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  AudioLines,
  Captions,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Maximize,
  Mic,
  Music,
  Play,
  Plus,
  RectangleHorizontal,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Type,
  Upload,
  Volume2,
  Zap,
} from "lucide-react";
import { focusRing } from "../ui/Button";
import { LogoMark } from "../ui/Logo";
import { MarketingFooter, MarketingHeader } from "../ui/marketing";
import { cn } from "../ui/format";
import { STATS, TESTIMONIALS, TRUSTED_LOGOS } from "../ui/showcase";

// ------------------------------------------------------------------ tokens

const img = (name: string) => `/landing/${name}.webp`;

export const LANDING_IMG = {
  heroBg: img("hero-bg"),
  heroVideo: img("hero-video"),
  demos: [img("idea-1"), img("idea-2"), img("idea-3"), img("idea-4")],
  brandCard: img("brand-card"),
  ctaBg: img("cta-bg"),
};

// Mockup palette: deep teal-black page, faint glass cards, coral gradient CTAs.
// The page background is inline because the unlayered .vd-root rule in
// app.css would beat a Tailwind bg-* utility.
const PAGE_BG = "#020c12";
const CARD = "border border-white/[0.07] bg-[#06151c]/80";
const MUTED = "text-[#8b949a]";
const CORAL_BTN =
  "bg-[linear-gradient(180deg,#ff8d62_0%,#f2703f_100%)] text-white shadow-[0_10px_30px_-10px_rgb(242_112_63/0.75),inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-110 active:brightness-95";

function CoralLink({ to, children, size = "md", className }: { to: string; children: ReactNode; size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-[10px] font-medium transition-[filter]",
        size === "lg" ? "h-[54px] px-7 text-[16px]" : "h-12 px-6 text-[15px]",
        CORAL_BTN,
        focusRing,
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

// ------------------------------------------------------------------ helpers

function Eyebrow({ children, center, plain }: { children: ReactNode; center?: boolean; plain?: boolean }) {
  return (
    <p
      className={cn(
        "text-[12px] font-medium uppercase tracking-[0.14em]",
        plain ? MUTED : "text-[#f08a5d]",
        !plain && "inline-block rounded-md bg-white/[0.04] px-2.5 py-1",
        center && "text-center",
      )}
    >
      {children}
    </p>
  );
}

function H2({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[44px]", className)}>{children}</h2>
  );
}

function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-3", className)}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2 text-[14px] text-[#b9c0c4]">
          <Check className="size-4 text-[#f2703f]" strokeWidth={2.5} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

function Container({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1312px] scroll-mt-24 px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="mx-auto h-px max-w-[1248px] bg-white/[0.06]" aria-hidden />;
}

function PlayBadge({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm", className)} aria-hidden>
      <Play className="size-3 translate-x-[1px] fill-current" />
    </span>
  );
}

function HeadlineOverlay({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "font-semibold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-[0_4px_18px_rgb(0_0_0/0.5)]",
        className,
      )}
    >
      Ideas
      <br />
      Move
      <br />
      <span className="text-[#ff8d62]">the World.</span>
    </p>
  );
}

// ------------------------------------------------------------------ hero mock

const SIDEBAR_ICONS = [LayoutGrid, Folder, Clapperboard, Layers, Music, ImageIcon, Type];
const TIMELINE = ["hero-video", "idea-1", "idea-2", "hero-video", "idea-3", "idea-4", "tpl-event", "cta-bg"];

function ProductMock() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[18px] border border-white/[0.09] bg-[#0a1a22]/90 shadow-[0_50px_120px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.05)] backdrop-blur-xl"
      aria-hidden
    >
      {/* top bar */}
      <div className="flex h-11 items-center gap-3 border-b border-white/[0.06] px-4">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#f2703f]" />
          <span className="size-2 rounded-full bg-white/25" />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">Videly</span>
        <span className="ml-4 hidden h-2 w-12 rounded-full bg-white/10 sm:block" />
        <span className="hidden h-2 w-10 rounded-full bg-white/[0.06] sm:block" />
        <ChevronRight className="ml-auto size-4 text-white/30" />
      </div>
      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-12 shrink-0 flex-col items-center gap-5 border-r border-white/[0.06] py-5 sm:flex">
          {SIDEBAR_ICONS.map((I, i) => (
            <I key={i} className={cn("size-4", i === 0 ? "text-white/80" : "text-white/35")} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:p-4">
            {/* player */}
            <div className="min-w-0">
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-black">
                <img
                  src={LANDING_IMG.heroVideo}
                  alt=""
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover"
                />
                <div className="absolute inset-0 flex items-center bg-gradient-to-r from-black/35 via-transparent to-transparent pl-[8%]">
                  <HeadlineOverlay className="text-[clamp(20px,2.6vw,36px)]" />
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-3 px-1 text-white/85">
                <Play className="size-3.5 fill-current" />
                <div className="relative h-[3px] flex-1 rounded-full bg-white/15">
                  <div className="h-full w-[38%] rounded-full bg-white/70" />
                  <span className="absolute left-[38%] top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2703f]" />
                </div>
                <span className="w-[22%]" />
                <Volume2 className="size-3.5" />
                <Maximize className="size-3.5" />
              </div>
            </div>
            {/* generate panel */}
            <div className="hidden flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 sm:flex">
              <p className="text-[12.5px] font-medium text-white">Generate</p>
              <div className="rounded-lg border border-[#f2703f]/45 bg-black/20 p-2.5 text-[11px] leading-snug text-white/70">
                A cinematic video about exploring mountains at sunset
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-2.5 py-2 text-[11px] text-white/80">
                <span className="flex items-center gap-1.5">
                  <RectangleHorizontal className="size-3.5 text-white/50" /> 16:9
                </span>
                <ChevronDown className="size-3.5 text-white/40" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] px-2.5 py-2 text-[11px] text-white/80">
                <span className="flex items-center gap-1.5">
                  <Mic className="size-3.5 text-white/50" /> AI Voice
                </span>
                <ChevronDown className="size-3.5 text-white/40" />
              </div>
              <div className={cn("mt-1 flex h-9 items-center justify-center rounded-lg text-[12.5px] font-medium", CORAL_BTN)}>Generate</div>
              <div className="mt-auto flex items-center justify-between rounded-lg border border-white/[0.06] px-2.5 py-2 text-white/40">
                <Film className="size-3.5" />
                <AudioLines className="size-3.5" />
                <Captions className="size-3.5" />
                <Scissors className="size-3.5" />
                <Settings2 className="size-3.5" />
              </div>
            </div>
          </div>
          {/* timeline */}
          <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-3">
            <Type className="size-3.5 shrink-0 text-white/45" />
            <div className="relative flex h-12 min-w-0 flex-1 gap-1">
              {TIMELINE.map((n, i) => (
                <div
                  key={i}
                  className={cn("h-full flex-1 rounded-md bg-cover bg-center", i > 5 && "opacity-45")}
                  style={{ backgroundImage: `url(/landing/${n}.webp)` }}
                />
              ))}
              <span className="absolute -bottom-1 -top-1.5 left-[42%] w-px bg-white/80">
                <span className="absolute -left-[3px] -top-1 size-[7px] rounded-full bg-[#f2703f]" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sections

// Only real customers' logos with permission, otherwise real stats, otherwise
// nothing (see showcase.ts) — the mockup's logo strip is not faked here.
function TrustedBy() {
  if (TRUSTED_LOGOS.length > 0) {
    return (
      <Container className="pt-14">
        <p className={cn("text-center text-[12px] font-medium uppercase tracking-[0.14em]", MUTED)}>Trusted by creators and businesses</p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          {TRUSTED_LOGOS.map((l) => (
            <li key={l.name}>
              <img src={l.src} alt={l.name} loading="lazy" className="h-7 w-auto opacity-60 grayscale" />
            </li>
          ))}
        </ul>
        <div className="mt-10 h-px bg-white/[0.06]" aria-hidden />
      </Container>
    );
  }
  if (STATS.length > 0) {
    return (
      <Container className="pt-14">
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <dd className="text-3xl font-semibold text-white">{s.value}</dd>
              <dt className={cn("mt-1 text-sm", MUTED)}>{s.label}</dt>
            </div>
          ))}
        </dl>
      </Container>
    );
  }
  return null;
}

const FEATURES = [
  { icon: Zap, title: "AI-Powered Creation", body: "Turn text, images or ideas into professional videos." },
  { icon: LayoutGrid, title: "Stunning Templates", body: "Choose from a growing library of modern, cinematic templates." },
  { icon: Layers, title: "Your Brand, Consistent", body: "Keep your logo, colors, fonts and style in every video." },
  { icon: Upload, title: "Export Anywhere", body: "Optimized for social media, ads, and presentations." },
];

function Features() {
  return (
    <Container id="features" className="py-14 lg:py-16">
      <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col items-center text-center">
            <Icon className="size-7 text-white/90" strokeWidth={1.5} aria-hidden />
            <h3 className="mt-5 text-[17px] font-medium text-white">{title}</h3>
            <p className={cn("mt-2 max-w-[230px] text-[14px] leading-[1.5]", MUTED)}>{body}</p>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function CreateFaster({ ctaHref }: { ctaHref: string }) {
  const [active, setActive] = useState(0);
  return (
    <Container className="py-14 lg:py-16">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.05fr_auto] lg:gap-6">
        <div className="min-w-0 lg:pr-16">
          <Eyebrow>Create faster</Eyebrow>
          <H2 className="mt-4">
            From idea to video
            <br className="hidden sm:block" /> in minutes
          </H2>
          <p className={cn("mt-5 max-w-[440px] text-[17px] leading-[1.6]", MUTED)}>
            Describe your idea, choose a style, and let AI do the heavy lifting. Edit, fine-tune and export a ready-to-share video — no
            complex tools, no steep learning curve.
          </p>
          <CoralLink to={ctaHref} className="mt-8">
            Try it now
          </CoralLink>
        </div>
        <div className="relative aspect-[6/5] min-w-0 overflow-hidden rounded-2xl border border-white/[0.1] shadow-[0_0_60px_-10px_rgb(255_170_120/0.25)]">
          <img src={LANDING_IMG.demos[active]} alt="Example Videly video" loading="lazy" className="absolute inset-0 size-full object-cover" />
          <span className="absolute left-1/2 top-1/2 flex size-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70 bg-black/30 backdrop-blur-sm" aria-hidden>
            <Play className="size-7 translate-x-0.5 fill-white text-white" />
          </span>
        </div>
        <div role="tablist" aria-label="Example videos" className="vd-noscrollbar flex gap-3 overflow-x-auto lg:w-[124px] lg:flex-col">
          {LANDING_IMG.demos.map((src, i) => (
            <button
              key={src}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-label={`Example video ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "relative aspect-[4/3] w-[124px] shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                i === active ? "border-[#f2703f] shadow-[0_0_24px_-4px_rgb(242_112_63/0.6)]" : "border-white/[0.08] opacity-80 hover:opacity-100",
                focusRing,
              )}
            >
              <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </Container>
  );
}

// Static showcase cards; each links to the matching template id.
const TEMPLATE_CARDS = [
  { id: "product-promo", name: "Product Promo", tagline: "Clean and modern", img: img("tpl-product") },
  { id: "app-showcase", name: "App Showcase", tagline: "Highlight your product", img: img("tpl-app") },
  { id: "brand-story", name: "Brand Story", tagline: "Cinematic & emotional", img: img("tpl-brand") },
  { id: "social-ad", name: "Social Media Ad", tagline: "Short & engaging", img: img("tpl-social") },
  { id: "event-teaser", name: "Event Teaser", tagline: "High energy", img: img("tpl-event") },
  { id: "minimal-product", name: "Minimal Product", tagline: "Sleek and stylish", img: img("tpl-minimal") },
];

function TemplatesRow({ templateHref }: { templateHref: (id: string) => string }) {
  return (
    <Container id="templates" className="py-14 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Professional templates</Eyebrow>
          <H2 className="mt-4">
            Start with a template,
            <br className="hidden sm:block" /> make it yours
          </H2>
          <p className={cn("mt-4 max-w-[640px] text-[17px] leading-[1.6]", MUTED)}>
            Choose from a library of templates for social media, product videos, ads, brand stories and more. Fully customizable to match your
            style.
          </p>
        </div>
        <Link to="/templates" className={cn("mb-1 inline-flex items-center gap-2 rounded-md text-[15px] text-white/85 hover:text-white", focusRing)}>
          Browse all templates <ArrowRight className="size-4 text-[#f2703f]" aria-hidden />
        </Link>
      </div>
      <ul className="vd-noscrollbar -mx-4 mt-10 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mr-8 lg:pr-8">
        {TEMPLATE_CARDS.map((t) => (
          <li key={t.id} className="w-[200px] shrink-0 sm:w-[196px] lg:w-[calc((100%-100px)/6)]">
            <Link to={templateHref(t.id)} className={cn("group block rounded-xl", focusRing)}>
              <div className="relative aspect-[6/7] overflow-hidden rounded-xl border border-white/[0.07] bg-[#06151c]">
                <img src={t.img} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                <PlayBadge className="absolute bottom-3 left-3" />
              </div>
              <p className="mt-4 text-[16px] font-medium text-white">{t.name}</p>
              <p className={cn("mt-0.5 text-[13px]", MUTED)}>{t.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function BrandSection({ ctaHref }: { ctaHref: string }) {
  return (
    <Container className="py-14 lg:py-16">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div>
          <Eyebrow>Your brand, always on</Eyebrow>
          <H2 className="mt-4">
            Keep your brand
            <br className="hidden sm:block" /> consistent
          </H2>
          <p className={cn("mt-5 max-w-[560px] text-[17px] leading-[1.6]", MUTED)}>
            Upload your logo, set your colors, fonts, voice and tone. Videly automatically keeps your brand identity consistent across every
            video.
          </p>
          <CoralLink to={ctaHref} className="mt-8">
            Set up your brand
          </CoralLink>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row" aria-hidden>
          <div className={cn("w-full rounded-2xl p-6 sm:w-[282px]", CARD)}>
            <p className="border-b border-white/[0.06] pb-4 text-[15px] text-white/90">Brand Kit</p>
            <div className="mt-5 flex items-center gap-2.5">
              <LogoMark size={40} variant="outline" />
              <span className="text-[32px] font-semibold tracking-[-0.02em] text-white">Videly</span>
            </div>
            <p className="mt-5 text-[14px] text-white/85">Colors</p>
            <div className="mt-2.5 flex items-center gap-2.5">
              {["#f2894f", "#4a5866", "#1d2a33"].map((c) => (
                <span key={c} className="size-9 rounded-full border border-white/10" style={{ background: c }} />
              ))}
              <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
                <Plus className="size-3.5" />
              </span>
            </div>
            <p className="mt-6 text-[14px] text-white/85">Fonts</p>
            <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white/[0.05] px-4 py-3 text-[16px] text-white">
              Inter
              <span className="flex items-center gap-3 text-white/60">
                <span className="text-[12px] italic">Aa</span>
                <ChevronDown className="size-4" />
              </span>
            </div>
          </div>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/[0.1] shadow-[0_20px_50px_-10px_rgb(242_112_63/0.35)] sm:w-[322px]">
            <img src={LANDING_IMG.brandCard} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
            <HeadlineOverlay className="absolute left-8 top-[26%] text-[36px]" />
            <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[#f2703f]" />
          </div>
        </div>
      </div>
    </Container>
  );
}

const STEPS = [
  { icon: FileText, ghost: FileText, title: "Describe your idea", body: "Type a prompt or upload your content (images, scripts, links)." },
  { icon: SlidersHorizontal, ghost: SlidersHorizontal, title: "Customize", body: "Choose a template, edit scenes, add your brand, music and voice." },
  { icon: Upload, ghost: Upload, title: "Export and share", body: "Download and publish anywhere — in the perfect format." },
];

function HowItWorks() {
  return (
    <Container id="how-it-works" className="py-14 lg:py-16">
      <Eyebrow center plain>
        How it works
      </Eyebrow>
      <H2 className="mt-3 text-center sm:text-[40px]">Create a video in 3 simple steps</H2>
      <ol className="relative mt-12 grid gap-6 md:grid-cols-3 md:gap-8">
        {STEPS.map(({ icon: Icon, ghost: Ghost, title, body }, i) => (
          <li key={title} className="relative flex gap-4 rounded-2xl border border-white/[0.06] bg-[#071a22]/80 p-6">
            {/* connector column */}
            <div className="flex flex-col items-center" aria-hidden>
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-white/45">
                <Ghost className="size-5" strokeWidth={1.5} />
              </span>
              <span className="my-2 w-px flex-1 bg-gradient-to-b from-white/15 to-white/5" />
              <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.05] text-white/60">
                <Plus className="size-3.5" />
              </span>
            </div>
            <div className="min-w-0 pb-1">
              <span className="flex size-[52px] items-center justify-center rounded-2xl bg-[#0f3440] text-white" aria-hidden>
                <Icon className="size-6" strokeWidth={1.6} />
              </span>
              <h3 className="mt-5 text-[19px] font-medium text-white">{title}</h3>
              <p className={cn("mt-2 text-[14.5px] leading-[1.55]", MUTED)}>{body}</p>
            </div>
            {i < STEPS.length - 1 && (
              <span className="absolute -right-[22px] top-1/2 hidden h-px w-3 bg-white/15 md:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </Container>
  );
}

type UseCat = "product" | "social" | "brand" | "app" | "event" | "youtube" | "ads";
const USE_TABS: { key: UseCat | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "product", label: "Product" },
  { key: "social", label: "Social Media" },
  { key: "brand", label: "Brand" },
  { key: "app", label: "App" },
  { key: "event", label: "Event" },
  { key: "youtube", label: "YouTube" },
  { key: "ads", label: "Ads" },
];
const USE_CASES: { img: string; cats: UseCat[]; featured?: boolean }[] = [
  { img: img("use-product"), cats: ["product", "ads"] },
  { img: img("use-city"), cats: ["youtube", "brand", "app"], featured: true },
  { img: img("use-sunset"), cats: ["brand", "social"] },
  { img: img("tpl-social"), cats: ["social", "ads"] },
  { img: img("tpl-event"), cats: ["event", "social"] },
  { img: img("use-mountain"), cats: ["youtube", "brand"] },
];

function UseCases({ ctaHref }: { ctaHref: string }) {
  const [cat, setCat] = useState<UseCat | "all">("all");
  const items = USE_CASES.filter((u) => cat === "all" || u.cats.includes(cat));
  return (
    <Container className="py-14 lg:py-16">
      <Eyebrow plain>Perfect for every creator</Eyebrow>
      <H2 className="mt-3 sm:text-[40px]">One tool. Endless possibilities.</H2>
      <div role="tablist" aria-label="Video categories" className="vd-noscrollbar -mx-4 mt-7 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {USE_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={cat === t.key}
            onClick={() => setCat(t.key)}
            className={cn(
              "h-11 shrink-0 rounded-[10px] px-6 text-[14.5px] transition-colors",
              cat === t.key ? CORAL_BTN : "bg-white/[0.04] text-white/85 hover:bg-white/[0.08]",
              focusRing,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((u) => (
          <li key={u.img}>
            <Link to={ctaHref} className={cn("group relative block aspect-[9/10] overflow-hidden rounded-xl border border-white/[0.07]", focusRing)}>
              <img src={u.img} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              {u.featured && (
                <span className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70 bg-black/25 backdrop-blur-sm" aria-hidden>
                  <Play className="size-5 translate-x-0.5 fill-white text-white" />
                </span>
              )}
              <PlayBadge className="absolute bottom-3 left-3" />
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

// Real quotes with the person's consent only — never invented. Hidden while
// TESTIMONIALS has fewer than 3 entries.
function Testimonials() {
  if (TESTIMONIALS.length < 3) return null;
  return (
    <Container className="py-14 lg:py-16">
      <Eyebrow plain>Loved by creators</Eyebrow>
      <H2 className="mt-3 sm:text-[40px]">What our users say</H2>
      <ul className="mt-8 grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <li key={t.name} className={cn("rounded-2xl p-6", CARD)}>
            <blockquote className="text-[15px] leading-relaxed text-white/85">“{t.quote}”</blockquote>
            <div className="mt-5 flex items-center gap-3">
              {t.avatar && <img src={t.avatar} alt="" loading="lazy" className="size-10 rounded-full object-cover" />}
              <div>
                <p className="text-sm font-medium text-white">{t.name}</p>
                {t.role && <p className={cn("text-xs", MUTED)}>{t.role}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function FinalCta({ ctaHref }: { ctaHref: string }) {
  return (
    <div className="relative mt-10 overflow-hidden">
      <img src={LANDING_IMG.ctaBg} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#020c12_0%,rgb(2_12_18/0.35)_30%,rgb(2_12_18/0.35)_70%,#020c12_100%)]" aria-hidden />
      <div className="relative mx-auto flex max-w-[1312px] flex-col items-center px-6 py-20 text-center sm:py-24">
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/60">Your next video is one prompt away</p>
        <H2 className="mt-4 sm:text-[42px]">Ready to bring your ideas to life?</H2>
        <p className="mt-4 max-w-[460px] text-[17px] leading-[1.55] text-white/75">
          Join creators and businesses using Videly to make stunning videos, faster.
        </p>
        <CoralLink to={ctaHref} size="lg" className="mt-9 px-9">
          Get started for free
        </CoralLink>
        <CheckList className="mt-8 justify-center" items={["No credit card required", "Professional templates", "Export in high quality"]} />
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
  const templateHref = (id: string) => (isAuthed ? `/home?template=${encodeURIComponent(id)}` : "/register");

  return (
    <div className="vd-root relative min-h-screen overflow-x-hidden" style={{ background: PAGE_BG }}>
      <a href="#main" className="sr-only z-[200] rounded-lg bg-coral px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      {/* hero backdrop sits behind the transparent header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[980px] overflow-hidden" aria-hidden>
        <img src={LANDING_IMG.heroBg} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover object-right-top opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#020c12_0%,rgb(2_12_18/0.75)_35%,rgb(2_12_18/0.2)_70%,rgb(2_12_18/0.35)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[420px] bg-gradient-to-b from-transparent to-[#020c12]" />
      </div>
      <MarketingHeader isAuthed={isAuthed} tone="landing" />
      <main id="main" className="relative">
        {/* Hero */}
        <div className="mx-auto grid max-w-[1312px] grid-cols-1 items-center gap-12 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14 lg:px-8 lg:pb-16 lg:pt-16">
          <div>
            <Eyebrow>AI-powered video creation</Eyebrow>
            <h1 className="mt-6 text-[44px] font-semibold leading-[1.08] tracking-[-0.025em] text-white sm:text-[56px] lg:text-[62px]">
              Turn any idea
              <br className="hidden sm:block" /> into a stunning <span className="text-[#ff7c4d]">motion video.</span>
            </h1>
            <p className={cn("mt-5 max-w-[480px] text-[18px] leading-[1.55]", "text-[#a3abb0]")}>
              Describe what you want, add your content, and get a professional video in minutes.
            </p>
            <CoralLink to={ctaHref} size="lg" className="mt-8">
              {isAuthed ? "Open the app" : "Create your first video"}
            </CoralLink>
            <CheckList className="mt-9 max-w-[480px]" items={["No editing skills required", "Professional templates", "AI voice & music"]} />
          </div>
          <ProductMock />
        </div>

        <TrustedBy />
        <Features />
        <CreateFaster ctaHref={ctaHref} />
        <Divider />
        <TemplatesRow templateHref={templateHref} />
        <Divider />
        <BrandSection ctaHref={isAuthed ? "/brand" : ctaHref} />
        <Divider />
        <HowItWorks />
        <Divider />
        <UseCases ctaHref={ctaHref} />
        <Testimonials />
        <FinalCta ctaHref={ctaHref} />
      </main>
      <MarketingFooter />
    </div>
  );
};


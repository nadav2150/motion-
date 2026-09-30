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
  Film,
  Folder,
  Image as ImageIcon,
  Layers,
  Link2,
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
  Sparkles,
  Type,
  Upload,
  Volume2,
  Zap,
  MousePointer2,
  Palette,
  Shapes,
  X,
  LayoutTemplate,
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
    <section id={id} className={cn("mx-auto max-w-[1376px] scroll-mt-24 px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="mx-auto h-px max-w-[1312px] bg-white/[0.06]" aria-hidden />;
}

function PlayBadge({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm", className)} aria-hidden>
      <Play className="size-3 translate-x-[1px] fill-current" />
    </span>
  );
}

function HeadlineOverlay({ className, accent = "#ff8d62", fontFamily }: { className?: string; accent?: string; fontFamily?: string }) {
  return (
    <p
      className={cn(
        "font-semibold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-[0_4px_18px_rgb(0_0_0/0.5)]",
        className,
      )}
      style={{ fontFamily }}
    >
      Ideas
      <br />
      Move
      <br />
      <span className="transition-colors duration-300" style={{ color: accent }}>
        the World.
      </span>
    </p>
  );
}

// ------------------------------------------------------------------ hero mock

const EDITOR_TOOLS = [
  { icon: Folder, label: "Media" },
  { icon: Type, label: "Text" },
  { icon: Shapes, label: "Elements" },
  { icon: Music, label: "Audio" },
  { icon: Palette, label: "Style" },
  { icon: LayoutTemplate, label: "Templates" },
];

const EDITOR_CLIPS = [
  { src: img("th-launch"), label: "Product Launch", time: "0:15" },
  { src: img("th-feature"), label: "Feature Demo", time: "0:12" },
  { src: img("th-app"), label: "App Promo", time: "0:18", play: true },
  { src: img("th-brand"), label: "Brand Video", time: "0:20" },
];

const TIMELINE_CLIPS = [img("hero-screen"), img("th-feature"), img("th-app"), img("th-brand")];
const WAVE = [4, 7, 5, 9, 6, 11, 8, 13, 9, 12, 7, 10, 14, 9, 11, 6, 12, 8, 10, 13, 7, 9, 12, 6, 10, 8, 11, 5, 9, 7];

// Faded video cards floating around the editor (decorative, wide screens only).
function FloatingCard({ src, label, className }: { src: string; label: string; className: string }) {
  return (
    <div className={cn("absolute hidden overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)] lg:block", className)}>
      <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <span className="absolute bottom-2.5 left-3 text-[12px] font-semibold italic text-white/90">{label}</span>
    </div>
  );
}

function HeroEditor() {
  return (
    <div className="relative min-w-0 lg:pb-16 lg:pt-4 lg:[perspective:2400px]" aria-hidden>
      <FloatingCard src={img("th-launch")} label="Product Launch" className="-left-[4%] top-[2%] w-[190px] opacity-85 [transform:rotateY(24deg)_rotateZ(-10deg)]" />
      <FloatingCard src={img("th-feature")} label="Feature Demo" className="left-[1%] top-[40%] w-[150px] opacity-70 [transform:rotateY(24deg)_rotateZ(-4deg)]" />
      <FloatingCard src={img("th-app")} label="App Promo" className="-right-[9%] top-[6%] w-[170px] opacity-35 blur-[1.5px] [transform:rotateY(-26deg)]" />
      <FloatingCard src={img("th-launch")} label="Product Demo" className="-right-[11%] top-[48%] w-[160px] opacity-25 blur-[2px] [transform:rotateY(-26deg)]" />

      {/* editor window */}
      <div className="relative overflow-hidden rounded-[20px] border border-white/[0.12] bg-[#0a1016]/95 shadow-[0_0_0_1px_rgb(242_112_63/0.18),0_0_80px_-20px_rgb(242_112_63/0.55),0_60px_120px_-30px_rgb(0_0_0/0.95)] backdrop-blur-xl lg:ml-[17%] lg:mr-[3%] lg:origin-left lg:[transform:rotateY(-9deg)_rotateZ(1.5deg)]">
        {/* title bar */}
        <div className="flex h-12 items-center border-b border-white/[0.06] px-5">
          <LogoMark size={20} variant="outline" />
          <span className="ml-2 text-[16px] font-semibold tracking-[-0.01em] text-white">Videly</span>
          <X className="ml-auto size-4 text-white/60" />
        </div>
        <div className="flex">
          {/* tool sidebar */}
          <div className="hidden w-[68px] shrink-0 flex-col items-center gap-5 border-r border-white/[0.06] py-5 sm:flex">
            {EDITOR_TOOLS.map(({ icon: I, label }, i) => (
              <span key={label} className={cn("flex flex-col items-center gap-1 text-[9.5px]", i === 0 ? "text-white" : "text-white/45")}>
                <I className="size-[17px]" strokeWidth={1.6} />
                {label}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex gap-3 p-3 sm:p-4">
              {/* player */}
              <div className="min-w-0 flex-1">
                <div className="relative aspect-[16/9.4] overflow-hidden rounded-xl bg-black">
                  <img src={img("hero-screen")} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.6)_32%,rgb(0_0_0/0.05)_55%,transparent_100%)]" />
                  <div className="absolute left-[7%] top-[13%]">
                    <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[clamp(8px,0.75vw,11px)] font-medium text-white/90 backdrop-blur-sm">
                      New Product
                    </span>
                    <p className="mt-3 text-[clamp(20px,2.6vw,40px)] font-bold leading-[0.98] tracking-[-0.025em] text-white">
                      Smarter
                      <br />
                      Faster
                      <br />
                      <span className="text-[#ff7c4d]">Together</span>
                    </p>
                    <p className="mt-2.5 text-[clamp(9px,0.85vw,13px)] text-white/85">All your work in one place.</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 px-1 text-white">
                  <Play className="size-4 fill-current" />
                  <div className="relative h-[3px] flex-1 rounded-full bg-white/15">
                    <div className="h-full w-[20%] rounded-full bg-[#f2703f]" />
                    <span className="absolute left-[20%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f2703f] shadow-[0_0_10px_rgb(242_112_63/0.9)]" />
                  </div>
                  <span className="w-[18%]" />
                  <span className="text-[12px] tabular-nums tracking-wide text-white/55">0:03 / 0:15</span>
                </div>
              </div>
              {/* clip list */}
              <div className="hidden w-[23%] shrink-0 flex-col gap-2.5 md:flex">
                {EDITOR_CLIPS.map((c) => (
                  <div key={c.label} className="relative aspect-[16/10.5] overflow-hidden rounded-lg border border-white/[0.08]">
                    <img src={c.src} alt="" className="absolute inset-0 size-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    {c.play && (
                      <span className="absolute left-1/2 top-[42%] flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50">
                        <Play className="size-3 translate-x-px fill-white text-white" />
                      </span>
                    )}
                    <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-white">{c.label}</span>
                    <span className="absolute bottom-1.5 right-2 text-[9px] tabular-nums text-white/80">{c.time}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* timeline */}
            <div className="relative flex items-center gap-2 border-t border-white/[0.06] px-4 py-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/80">
                <Type className="size-4" />
              </span>
              {TIMELINE_CLIPS.map((src, i) => (
                <span
                  key={i}
                  className={cn("h-11 w-[11%] shrink-0 rounded-md bg-cover bg-center", i === 0 && "ring-2 ring-[#f2703f]")}
                  style={{ backgroundImage: `url(${src})` }}
                />
              ))}
              <span className="flex h-11 min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden rounded-md bg-[#2a1f5c]/70 px-2">
                {WAVE.map((h, i) => (
                  <span key={i} className="w-[2px] rounded-full bg-[#9d8cff]" style={{ height: `${h * 2.4}px` }} />
                ))}
              </span>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/80">
                <Plus className="size-4" />
              </span>
              {/* playhead */}
              <span className="absolute -top-2 bottom-1 left-[calc(1rem+2.75rem+0.5rem+5.5%)] w-px bg-[#f2703f]">
                <span className="absolute -left-[4px] -top-1 size-[9px] rounded-full bg-[#f2703f]" />
                <MousePointer2 className="absolute -left-0.5 bottom-0 size-4 fill-white text-black" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* floating prompt card */}
      <div className="relative mx-auto mt-4 w-full max-w-[300px] rounded-2xl border border-white/[0.12] bg-[#0d151b]/90 p-3.5 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.95)] backdrop-blur-xl lg:absolute lg:-left-[7%] lg:bottom-[0%] lg:mt-0 lg:w-[29%] lg:max-w-none lg:[transform:rotateY(22deg)_rotateZ(-6deg)]">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-black/30 px-3.5 py-3 text-[13.5px] leading-snug text-white/90">
          <span className="flex-1">Create a product launch video for our new app</span>
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", CORAL_BTN)}>
            <ArrowRight className="size-4" />
          </span>
        </div>
        {[
          { icon: RectangleHorizontal, label: "16:9" },
          { icon: Mic, label: "AI Voice" },
          { icon: Music, label: "Music" },
        ].map(({ icon: I, label }) => (
          <div key={label} className="mt-2 flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white/85">
            <I className="size-4 text-white/60" /> {label}
            <ChevronRight className="ml-auto size-4 text-white/35" />
          </div>
        ))}
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
    <Container id="features" className="pb-10 pt-6 lg:pb-10 lg:pt-8">
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

// "Your reference → your idea → a new motion video" flow. All UI copy is real
// text layered over AI-generated frames (public/landing/flow-*, strip-*).
function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2.5 text-[15px] text-white xl:text-[16px]">
      <span className="flex size-7 items-center justify-center rounded-full border border-white/15 bg-[#f2703f] text-[13px] font-semibold text-white shadow-[0_0_18px_-2px_rgb(242_112_63/0.8)]">
        {n}
      </span>
      {children}
    </p>
  );
}

function FlowArrow() {
  return (
    <ArrowRight
      className="mx-auto size-8 shrink-0 rotate-90 text-white/85 drop-shadow-[0_0_10px_rgb(242_112_63/0.7)] xl:mt-[210px] xl:rotate-0"
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

const FLOW_CARD =
  "rounded-2xl border border-white/[0.09] bg-[#0b1419]/90 p-3.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.05)] backdrop-blur-md";

const STRIP: { src: string; label?: ReactNode }[] = [
  {
    src: img("flow-video"),
    label: (
      <span className="text-[10px] font-extrabold italic leading-[0.95] text-white">
        Plan
        <br />
        Create
        <br />
        <span className="text-[#ff7c4d]">Achieve</span>
      </span>
    ),
  },
  { src: img("strip-beam") },
  { src: img("strip-lists") },
  {
    src: img("strip-end"),
    label: (
      <span className="text-[13px] font-extrabold italic leading-[0.95] text-white">
        Smarter
        <br />
        Faster
        <br />
        <span className="text-[#ff7c4d]">Together</span>
      </span>
    ),
  },
  { src: img("strip-icons") },
  {
    src: img("strip-end"),
    label: (
      <span className="flex flex-col items-center gap-1 text-center">
        <span className="flex size-6 items-center justify-center rounded-md bg-[#f2703f]">
          <Sparkles className="size-3.5 text-white" />
        </span>
        <span className="text-[11px] font-bold text-white">FocusFlow</span>
      </span>
    ),
  },
];

function CreateFaster({ ctaHref }: { ctaHref: string }) {
  return (
    <section className="mx-auto max-w-[1376px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="grid grid-cols-1 items-center gap-12 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:gap-6">
        <div className="min-w-0">
          <Eyebrow>Create faster</Eyebrow>
          <H2 className="mt-5 sm:text-[48px] sm:leading-[1.1] xl:text-[45px]">
            Your reference.
            <br />
            Your idea.
            <br />
            <span className="whitespace-nowrap text-[#ff7c4d]">A new motion video.</span>
          </H2>
          <p className={cn("mt-6 max-w-[440px] text-[17px] leading-[1.65]", MUTED)}>
            Upload a video you love or paste a YouTube link. Tell Videly what you want to create, and it studies the visual style, pacing and
            motion to generate a completely new video for your brand.
          </p>
          <CoralLink to={ctaHref} size="lg" className="mt-9">
            Create a video
          </CoralLink>
        </div>

        {/* 3-step flow; tilted in 3D on wide screens, stacked below xl */}
        <div className="relative min-w-0 xl:[perspective:2200px]" aria-hidden>
          <div className="xl:origin-left xl:[transform:rotateY(-9deg)_rotateX(3deg)] xl:[transform-style:preserve-3d]">
            <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:items-start xl:gap-3">
              {/* 1. Reference */}
              <div className="mx-auto w-full max-w-[320px] xl:mx-0 xl:mt-16 xl:w-[20%] xl:max-w-none xl:shrink-0">
                <StepLabel n={1}>Reference</StepLabel>
                <div className={cn(FLOW_CARD, "relative")}>
                  <span className="absolute -left-2 -top-2 z-10 flex h-7 w-9 items-center justify-center rounded-lg bg-[#ff1f1f] shadow-lg">
                    <Play className="size-3.5 translate-x-px fill-white text-white" />
                  </span>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                    <img src={img("flow-ref")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-black/40 backdrop-blur-sm">
                      <Play className="size-4 translate-x-px fill-white text-white" />
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 text-[9px] font-medium tabular-nums text-white">0:32</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {[0, 25, 50, 75, 100].map((x, i) => (
                      <span
                        key={x}
                        className={cn("h-6 flex-1 rounded-[4px] bg-cover", i === 1 && "ring-1 ring-[#f2703f]")}
                        style={{ backgroundImage: `url(${img("flow-ref")})`, backgroundPosition: `${x}% 50%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 whitespace-nowrap rounded-lg bg-white/[0.04] px-3 py-2.5 text-[12px] text-white/85 xl:px-2 xl:text-[11px]">
                    <Link2 className="size-3.5 shrink-0 text-white/60" /> Paste YouTube link
                  </div>
                  <p className="my-1.5 text-center text-[10px] text-white/45">or</p>
                  <div className="flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] py-2.5 text-[12px] text-white/90">
                    <Upload className="size-3.5" /> Upload video
                  </div>
                </div>
              </div>

              <FlowArrow />

              {/* 2. Describe */}
              <div className="mx-auto w-full max-w-[320px] xl:mx-0 xl:mt-24 xl:w-[23%] xl:max-w-none xl:shrink-0">
                <StepLabel n={2}>Describe</StepLabel>
                <div className={FLOW_CARD}>
                  <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[12.5px] leading-[1.5] text-white/90">
                    Create a product launch video for our new AI productivity app. Modern, clean, bold, cinematic style like the reference.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-white/85 xl:flex-nowrap xl:text-[10px]">
                    <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-white/[0.05] px-2 py-1.5 xl:px-1.5">
                      <RectangleHorizontal className="size-3" /> 16:9
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-white/[0.05] px-2 py-1.5 xl:px-1.5">
                      <Mic className="size-3" /> AI Voice
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap rounded-md bg-white/[0.05] px-2 py-1.5 xl:px-1.5">
                      <Music className="size-3" /> Music
                    </span>
                  </div>
                  <div className={cn("mt-3 flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-medium", CORAL_BTN)}>
                    <Sparkles className="size-4" /> Generate
                  </div>
                </div>
              </div>

              <FlowArrow />

              {/* 3. Your motion video */}
              <div className="min-w-0 xl:flex-1">
                <StepLabel n={3}>Your motion video</StepLabel>
                <div className="relative overflow-hidden rounded-2xl border border-[#f2703f]/40 bg-black shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_0_60px_-12px_rgb(242_112_63/0.55),0_40px_80px_-30px_rgb(0_0_0/0.95)]">
                  <div className="relative aspect-[16/10]">
                    <img src={img("flow-video")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/15 to-transparent" />
                    <div className="absolute left-[7%] top-[16%]">
                      <p className="text-[clamp(26px,3vw,50px)] font-extrabold italic leading-[0.95] tracking-[-0.02em] text-white">
                        Plan
                        <br />
                        Create
                        <br />
                        <span className="text-[#ff7c4d]">Achieve</span>
                      </p>
                      <p className="mt-3 text-[clamp(11px,1vw,15px)] leading-snug text-white/80">
                        Your AI co-pilot
                        <br />
                        for what&apos;s next.
                      </p>
                    </div>
                    <div className="absolute right-[3%] top-[12%] hidden w-[27%] flex-col gap-2.5 sm:flex">
                      {["Turn ideas into actions", "Generate content", "Ship faster"].map((t, i) => (
                        <span
                          key={t}
                          className={cn("rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-[clamp(9px,0.8vw,12px)] font-medium leading-tight text-white backdrop-blur-md", i === 2 && "hidden min-[1400px]:block")}
                          style={{ transform: `translateX(${i * -6}px)` }}
                        >
                          <Sparkles className="mb-1 size-3 text-[#ff7c4d]" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-black/80 px-4 py-2.5 text-white">
                    <Play className="size-4 fill-current" />
                    <div className="relative h-[3px] flex-1 rounded-full bg-white/20">
                      <div className="h-full w-[27%] rounded-full bg-[#f2703f]" />
                      <span className="absolute left-[27%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f2703f] bg-white" />
                    </div>
                    <span className="text-[12px] tabular-nums text-white/85">0:12 / 0:45</span>
                    <Maximize className="size-4" />
                  </div>
                </div>
              </div>
            </div>

            {/* filmstrip of the generated video */}
            <div className="relative mt-5 xl:ml-[24%]">
              <div className="vd-noscrollbar flex gap-2 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0b1419]/80 p-2">
                {STRIP.map((f, i) => (
                  <div key={i} className="relative aspect-[16/10] w-[130px] shrink-0 overflow-hidden rounded-lg xl:w-auto xl:flex-1">
                    <img src={f.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    {f.label && <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-2">{f.label}</div>}
                  </div>
                ))}
              </div>
              {/* floor reflection */}
              <div className="pointer-events-none absolute inset-x-6 -bottom-10 h-10 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(242_112_63/0.25),transparent)] blur-md" />
            </div>
          </div>
        </div>
      </div>
    </section>
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
    <Container id="templates" className="py-12 lg:py-12">
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

// Interactive brand kit demo: picking a color or font restyles the preview.
const BRAND_COLORS = ["#f2894f", "#4cc9f0", "#a3e635", "#a78bfa", "#f472b6"];
const BRAND_FONTS = [
  { label: "Inter", family: "Inter, sans-serif" },
  { label: "Geist", family: "Geist, Inter, sans-serif" },
  { label: "Serif", family: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", family: "'Geist Mono', ui-monospace, monospace" },
];

function BrandSection({ ctaHref }: { ctaHref: string }) {
  const [accent, setAccent] = useState(BRAND_COLORS[0]!);
  const [font, setFont] = useState(BRAND_FONTS[0]!);
  const custom = !BRAND_COLORS.includes(accent);
  return (
    <Container className="py-12 lg:py-12">
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
          <p className="mt-4 flex items-center gap-2 text-[14px] text-white/60">
            <Sparkles className="size-4 text-[#f2703f]" aria-hidden />
            Try it — pick a color or font and watch the video update.
          </p>
          <CoralLink to={ctaHref} className="mt-8">
            Set up your brand
          </CoralLink>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className={cn("w-full rounded-2xl p-7 sm:w-[300px]", CARD)}>
            <p className="border-b border-white/[0.06] pb-4 text-[15px] text-white/90">Brand Kit</p>
            <div className="mt-5 flex items-center gap-2.5" aria-hidden>
              <LogoMark size={40} variant="outline" color={accent} />
              <span className="text-[32px] font-semibold tracking-[-0.02em] text-white" style={{ fontFamily: font.family }}>
                Videly
              </span>
            </div>
            <p id="brand-colors" className="mt-5 text-[14px] text-white/85">
              Colors
            </p>
            <div role="radiogroup" aria-labelledby="brand-colors" className="mt-2.5 flex flex-wrap items-center gap-2">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={accent === c}
                  aria-label={`Brand color ${c}`}
                  onClick={() => setAccent(c)}
                  className={cn(
                    "size-8 rounded-full border-2 transition-transform hover:scale-110",
                    accent === c ? "border-white ring-2 ring-white/25 ring-offset-2 ring-offset-[#06151c]" : "border-white/10",
                    focusRing,
                  )}
                  style={{ background: c }}
                />
              ))}
              {/* "+" opens the native color picker for any custom color */}
              <label
                className={cn(
                  "relative flex size-8 cursor-pointer items-center justify-center rounded-full border-2 text-white/70 transition-transform hover:scale-110 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-coral",
                  custom ? "border-white" : "border-white/10 bg-white/[0.04]",
                )}
                style={custom ? { background: accent } : undefined}
              >
                {!custom && <Plus className="size-3.5" aria-hidden />}
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  aria-label="Custom brand color"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            <label htmlFor="brand-font" className="mt-6 block text-[14px] text-white/85">
              Fonts
            </label>
            <div className="relative mt-2.5">
              <select
                id="brand-font"
                value={font.label}
                onChange={(e) => setFont(BRAND_FONTS.find((f) => f.label === e.target.value)!)}
                className={cn("w-full cursor-pointer appearance-none rounded-lg bg-white/[0.05] px-4 py-3 text-[16px] text-white", focusRing)}
                style={{ fontFamily: font.family }}
              >
                {BRAND_FONTS.map((f) => (
                  <option key={f.label} value={f.label} className="bg-[#0b1419]">
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center gap-3 text-white/60" aria-hidden>
                <span className="text-[12px] italic">Aa</span>
                <ChevronDown className="size-4" />
              </span>
            </div>
          </div>
          <div
            className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/[0.1] transition-shadow duration-300 sm:w-[340px]"
            style={{ boxShadow: `0 20px 50px -10px color-mix(in srgb, ${accent} 45%, transparent)` }}
            aria-label="Brand preview"
            role="img"
          >
            <img src={LANDING_IMG.brandCard} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(2_12_18/0.85)_0%,rgb(2_12_18/0.45)_45%,transparent_75%)]" />
            <HeadlineOverlay className="absolute left-8 top-[12%] text-[38px]" accent={accent} fontFamily={font.family} />
            <span className="absolute right-4 top-4" aria-hidden>
              <LogoMark size={26} variant="outline" color={accent} />
            </span>
            <span className="absolute inset-x-0 bottom-0 h-1.5 transition-colors duration-300" style={{ background: accent }} />
          </div>
        </div>
      </div>
    </Container>
  );
}

// "Create a video in 3 simple steps": each card carries a small mock of that
// step's UI, built from the landing imagery already in public/landing/.
const STEP_CARD =
  "relative flex min-w-0 flex-1 flex-col rounded-2xl border border-white/[0.08] bg-[#0a1419]/85 p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] backdrop-blur-md";
const MINI = "rounded-xl border border-white/[0.08] bg-black/25";

function StepHead({ n, icon: Icon, title, body }: { n: number; icon: typeof Play; title: string; body: string }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#f2703f] text-[13px] font-semibold text-white shadow-[0_0_16px_-2px_rgb(242_112_63/0.8)]">
          {n}
        </span>
        <span className="flex size-7 items-center justify-center rounded-md bg-white/[0.08] text-white">
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <h3 className="mt-3.5 text-[19px] font-semibold text-white">{title}</h3>
      <p className={cn("mt-1.5 text-[14px] leading-[1.5]", MUTED)}>{body}</p>
    </>
  );
}

function StepArrow() {
  return (
    <ArrowRight
      className="mx-auto size-7 shrink-0 rotate-90 self-center text-[#f2703f] drop-shadow-[0_0_8px_rgb(242_112_63/0.8)] lg:rotate-0"
      strokeWidth={2}
      aria-hidden
    />
  );
}

const WAVE_VOICE = [3, 6, 9, 5, 11, 7, 12, 8, 10, 6, 9, 4, 8, 11, 6, 9, 5, 7];
const WAVE_MUSIC = [4, 5, 7, 6, 8, 5, 9, 7, 6, 8, 5, 7, 6, 9, 5, 6, 7, 5, 8, 6];

function HowItWorks() {
  return (
    <Container id="how-it-works" className="py-12 lg:py-14">
      <div className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#050f14] px-4 py-10 sm:px-8 lg:px-10 lg:py-12">
        {/* coral light streaks along the bottom-right, as in the mockup */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_85%_100%,rgb(242_112_63/0.28),transparent_70%),radial-gradient(40%_30%_at_10%_0%,rgb(60_120_140/0.18),transparent_70%)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-56 w-[80%] rotate-[-8deg] rounded-[50%] border-t-2 border-[#ff8d62]/70 shadow-[0_-8px_40px_-6px_rgb(242_112_63/0.6)] blur-[1px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-36 -right-24 h-56 w-[70%] rotate-[-12deg] rounded-[50%] border-t border-[#f2703f]/35 blur-[2px]" aria-hidden />

        <div className="relative text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#f08a5d]">Start fast</p>
          <H2 className="mt-3 sm:text-[40px]">
            Create a video in <span className="text-[#ff7c4d]">3 simple steps</span>
          </H2>
          <p className={cn("mx-auto mt-3 max-w-[660px] text-[16px]", MUTED)}>
            Go from idea to a professional motion video in minutes. No editing skills required.
          </p>
        </div>

        <ol className="relative mt-10 flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-3">
          {/* 1. Describe */}
          <li className={STEP_CARD}>
            <StepHead
              n={1}
              icon={Play}
              title="Describe your idea"
              body="Write a simple prompt or upload a reference video. Add details like format, length and style."
            />
            <div className="mt-auto pt-5" aria-hidden>
              <div className="flex gap-2.5">
                <div className="relative w-[30%] shrink-0">
                  <span className="absolute -left-1.5 -top-1.5 z-10 flex h-4 w-5 items-center justify-center rounded bg-[#ff1f1f]">
                    <Play className="size-2 fill-white text-white" />
                  </span>
                  <div className="relative aspect-square overflow-hidden rounded-lg">
                    <img src={img("flow-ref")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50">
                      <Play className="size-2.5 translate-x-px fill-white text-white" />
                    </span>
                  </div>
                </div>
                <div className={cn(MINI, "flex-1 p-2.5 text-[11px] leading-[1.45] text-white/85")}>
                  Create a product launch video for our new app. Modern, clean, bold style.
                </div>
              </div>
              <div className="mt-2.5 flex gap-1.5 text-[10.5px] text-white/80">
                <span className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/[0.05] py-1.5">
                  <RectangleHorizontal className="size-3" /> 16:9
                </span>
                <span className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/[0.05] py-1.5">
                  <Mic className="size-3" /> AI Voice
                </span>
                <span className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/[0.05] py-1.5">
                  <Music className="size-3" /> Music
                </span>
              </div>
              <div className="relative mt-2.5 flex justify-end">
                <span className={cn("flex h-9 items-center gap-1.5 rounded-lg px-4 text-[12px] font-medium", CORAL_BTN)}>
                  <Sparkles className="size-3.5" /> Generate
                </span>
                <MousePointer2 className="absolute -bottom-2 right-3 size-4 fill-white text-black" />
              </div>
            </div>
          </li>

          <StepArrow />

          {/* 2. Customize */}
          <li className={STEP_CARD}>
            <StepHead
              n={2}
              icon={SlidersHorizontal}
              title="Customize"
              body="Pick a template, fine-tune the visuals, voice, music and style to match your brand."
            />
            <div className="mt-auto flex gap-2.5 pt-5" aria-hidden>
              <div className="w-[48%] shrink-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg ring-2 ring-[#f2703f]">
                  <img src={img("tpl-app")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-medium text-white">App Showcase</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {[
                    ["tpl-product", "Product"],
                    ["tpl-social", "Social"],
                    ["tpl-event", "Event"],
                    ["tpl-brand", "Brand"],
                  ].map(([n, l]) => (
                    <div key={n}>
                      <span className="block aspect-square rounded bg-cover bg-center" style={{ backgroundImage: `url(${img(n!)})` }} />
                      <span className="mt-0.5 block truncate text-center text-[8px] text-white/55">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[10.5px] text-white/85">
                <div className={cn(MINI, "flex items-center gap-1.5 px-2 py-2")}>
                  <Mic className="size-3 shrink-0 text-white/55" />
                  <span className="shrink-0">AI Voice</span>
                  <img src={img("th-brand")} alt="" loading="lazy" className="ml-auto size-5 shrink-0 rounded-full object-cover" />
                  <span className="flex h-3 items-center gap-px overflow-hidden">
                    {WAVE_VOICE.slice(0, 10).map((h, i) => (
                      <span key={i} className="w-[2px] rounded-full bg-[#f2703f]" style={{ height: `${h}px` }} />
                    ))}
                  </span>
                </div>
                <div className={cn(MINI, "flex items-center gap-1.5 px-2 py-2")}>
                  <Music className="size-3 shrink-0 text-white/55" />
                  <span className="shrink-0">Music</span>
                  <span className="ml-auto flex h-3 items-center gap-px overflow-hidden">
                    {WAVE_MUSIC.slice(0, 14).map((h, i) => (
                      <span key={i} className="w-[2px] rounded-full bg-white/35" style={{ height: `${h}px` }} />
                    ))}
                  </span>
                </div>
                <div className={cn(MINI, "flex items-center gap-1.5 px-2 py-2")}>
                  <Palette className="size-3 shrink-0 text-white/55" />
                  <span className="shrink-0">Style</span>
                  <span className="ml-auto flex gap-1">
                    <span className="h-4 w-5 rounded bg-cover bg-center ring-1 ring-[#f2703f]" style={{ backgroundImage: `url(${img("use-isometric")})` }} />
                    <span className="h-4 w-5 rounded bg-cover bg-center" style={{ backgroundImage: `url(${img("strip-icons")})` }} />
                  </span>
                </div>
              </div>
            </div>
          </li>

          <StepArrow />

          {/* 3. Export */}
          <li className={STEP_CARD}>
            <StepHead
              n={3}
              icon={Upload}
              title="Export and share"
              body="Download your video or publish directly to social media, ads and presentations."
            />
            <div className="mt-auto pt-5" aria-hidden>
              <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-black">
                <div className="relative aspect-[16/9.5]">
                  <img src={img("hero-screen")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.55)_35%,transparent_60%)]" />
                  <div className="absolute left-[6%] top-[16%]">
                    <p className="text-[clamp(16px,1.7vw,24px)] font-bold leading-[0.98] tracking-[-0.02em] text-white">
                      Smarter
                      <br />
                      Faster
                      <br />
                      <span className="text-[#ff7c4d]">Together.</span>
                    </p>
                    <p className="mt-1.5 text-[9px] leading-snug text-white/75">
                      Your AI co-pilot
                      <br />
                      for what&apos;s next.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2 text-white">
                  <Play className="size-3 fill-current" />
                  <div className="relative h-[2px] flex-1 rounded-full bg-white/20">
                    <div className="h-full w-[22%] rounded-full bg-[#f2703f]" />
                  </div>
                  <span className="text-[9px] tabular-nums text-white/70">0:03 / 0:15</span>
                  <Maximize className="size-3" />
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
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
  { img: img("use-watch"), cats: ["product", "ads"] },
  { img: img("use-isometric"), cats: ["youtube", "brand", "app"], featured: true },
  { img: img("use-kinetic"), cats: ["brand", "social"] },
  { img: img("tpl-social"), cats: ["social", "ads"] },
  { img: img("tpl-event"), cats: ["event", "social"] },
  { img: img("use-dashboard"), cats: ["youtube", "brand"] },
];

function UseCases({ ctaHref }: { ctaHref: string }) {
  const [cat, setCat] = useState<UseCat | "all">("all");
  const items = USE_CASES.filter((u) => cat === "all" || u.cats.includes(cat));
  return (
    <Container className="py-12 lg:py-12">
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
              "h-12 shrink-0 rounded-[10px] px-7 text-[16px] transition-colors",
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
    <Container className="py-12 lg:py-12">
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
      <div className="relative mx-auto flex max-w-[1376px] flex-col items-center px-6 py-20 text-center sm:py-24">
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
        <img src={LANDING_IMG.heroBg} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover object-right-top opacity-95" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#020c12_0%,rgb(2_12_18/0.8)_30%,rgb(2_12_18/0.15)_60%,rgb(2_12_18/0.3)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-[420px] bg-gradient-to-b from-transparent to-[#020c12]" />
      </div>
      <MarketingHeader isAuthed={isAuthed} tone="landing" />
      <main id="main" className="relative">
        {/* Hero */}
        <div className="mx-auto grid max-w-[1376px] grid-cols-1 items-center gap-12 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-6 lg:px-8 lg:pb-10 lg:pt-14">
          <div>
            <Eyebrow>AI-powered motion video creation</Eyebrow>
            <h1 className="mt-7 text-[44px] font-bold leading-[1.04] tracking-[-0.035em] text-white sm:text-[58px] xl:text-[66px]">
              Turn any idea
              <br className="hidden sm:block" /> into a stunning <span className="text-[#ff7c4d]">motion video.</span>
            </h1>
            <p className={cn("mt-5 max-w-[480px] text-[18px] leading-[1.55]", "text-[#a3abb0]")}>
              Describe what you want, add your content, and get a professional motion video in minutes.
            </p>
            <CoralLink to={ctaHref} size="lg" className="mt-8">
              {isAuthed ? "Open the app" : "Create your first video"}
            </CoralLink>
            <CheckList className="mt-9 flex-col gap-y-3.5 [&_li]:text-[15px]" items={["No editing skills required", "Professional templates", "AI voice & music"]} />
          </div>
          <HeroEditor />
        </div>

        <TrustedBy />
        <Features />
        <CreateFaster ctaHref={ctaHref} />
        <Divider />
        <TemplatesRow templateHref={templateHref} />
        <Divider />
        <BrandSection ctaHref={isAuthed ? "/brand" : ctaHref} />
        <HowItWorks />
        <UseCases ctaHref={ctaHref} />
        <Testimonials />
        <FinalCta ctaHref={ctaHref} />
      </main>
      <MarketingFooter tone="landing" />
    </div>
  );
};


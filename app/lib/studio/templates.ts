// Curated Studio templates. A template is a prompt + format + duration +
// style notes; it fills the Home prompt card or generates right away.
// previewVideoUrl / posterUrl are filled once scripts/make-showcase renders
// them with the pipeline itself (storyboards/showcase/...).

import type { StudioTemplate, TemplateCategory } from "./types";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "social", label: "Social Media" },
  { id: "brand", label: "Brand" },
  { id: "app", label: "App" },
  { id: "event", label: "Event" },
  { id: "youtube", label: "YouTube" },
  { id: "ads", label: "Ads" },
];

export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [
  {
    id: "product-promo",
    name: "Product Promo",
    tagline: "Hero reveal, three features, a price-free CTA",
    category: "product",
    format: "16:9",
    duration: 30,
    prompt:
      "A launch promo for [your product]. Open on a dramatic hero reveal of the product, then three quick feature beats (one benefit each, with a bold headline and a supporting line), and close on the product name, tagline and a clear call to action.",
    styleNotes:
      "Dark, high-contrast stage with one accent color. Product shot slides in with a masked reveal and a slow push-in. Features as kinetic type cards with numbered labels; hard cuts on the beat. Final lockup holds for at least 2 seconds.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "app-showcase",
    name: "App Showcase",
    tagline: "Phone mockup, UI flows, feature callouts",
    category: "app",
    format: "16:9",
    duration: 30,
    prompt:
      "Showcase the [app name] app: a phone frame floats in, the screen walks through the main flow (onboarding → core action → result), each step called out with a short headline. End on the app icon, name and 'Download now'.",
    styleNotes:
      "Clean light background with soft depth, the device slightly rotated in 3D and drifting. UI screens transition with vertical scroll-like pushes. Callouts draw in with SVG connector lines. Accent color taken from the brand.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "brand-story",
    name: "Brand Story",
    tagline: "Mission-led narrative with a warm voiceover",
    category: "brand",
    format: "16:9",
    duration: 45,
    prompt:
      "Tell the story of [brand]: the problem we saw, why we started, what we believe, and the promise we make to customers. Emotional, human, confident. End on the logo and the mission line.",
    styleNotes:
      "Editorial serif headlines with generous negative space, slow parallax layers, film-grain texture, warm palette. Words reveal line by line through clip-path masks. No flashy transitions — cross-dissolves and match cuts.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "social-media-ad",
    name: "Social Media Ad",
    tagline: "Scroll-stopping vertical ad with a hook in 1 second",
    category: "social",
    format: "9:16",
    duration: 15,
    prompt:
      "A vertical ad for [product/offer]. Hook in the first second with a bold question or claim, show the benefit in two punchy beats, add social proof, and finish with a strong call to action.",
    styleNotes:
      "Huge type (fills the width), fast cuts every 0.6–1s, bright saturated brand colors, sticker-like shapes that pop with elastic easing. Keep text out of the bottom 20% (platform UI).",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "event-teaser",
    name: "Event Teaser",
    tagline: "Countdown energy, date, venue, tickets",
    category: "event",
    format: "16:9",
    duration: 15,
    prompt:
      "A teaser for [event name] on [date] in [city/venue]. Build anticipation with a countdown feel, flash the headline speakers or highlights, reveal the date and venue, and end on 'Get your ticket'.",
    styleNotes:
      "Night palette with neon accent, glitchy RGB-split text hits on the beat, light streaks and a particle field used once for the big date reveal. Numbers tick with a slot-machine roll.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "minimal-product",
    name: "Minimal Product",
    tagline: "Quiet luxury: one object, lots of space",
    category: "product",
    format: "1:1",
    duration: 15,
    prompt:
      "A minimal, premium-feeling spot for [product]. One object, one idea: introduce it, reveal one defining detail, and close on the name.",
    styleNotes:
      "Off-white or deep charcoal background, one thin sans-serif, wide letter-spacing, very slow eases (power2.inOut, 1.5–2s moves), hairline rules that draw in, long holds. Restraint is the point.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "feature-announcement",
    name: "Feature Announcement",
    tagline: "What's new, why it matters, try it today",
    category: "app",
    format: "16:9",
    duration: 30,
    prompt:
      "Announce the new [feature] in [product]. Show the old pain in one beat, reveal the feature with a UI close-up, show two concrete outcomes, and end with 'Available today'.",
    styleNotes:
      "Product-UI aesthetic: crisp grids, cursor moves with eased paths, zoom-ins on UI details, highlight boxes that draw around the key element. Brand accent for the 'new' badge.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "instagram-reel",
    name: "Reel Explainer",
    tagline: "Three tips in a vertical kinetic-type reel",
    category: "social",
    format: "9:16",
    duration: 30,
    prompt:
      "A vertical reel sharing 3 quick tips about [topic]. Hook title, then tip 1, 2 and 3 each with a big number and a one-line explanation, then 'Follow for more'.",
    styleNotes:
      "Big numerals that morph from one to the next, words that pop in with staggered scale, a progress bar across the top, bright two-color palette. Every tip holds long enough to read aloud.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "logo-reveal",
    name: "Logo Reveal",
    tagline: "Five-second sting for intros and outros",
    category: "brand",
    format: "16:9",
    duration: 15,
    prompt:
      "An animated logo reveal for [brand]: abstract shapes in the brand colors assemble into the logo, then the tagline appears underneath.",
    styleNotes:
      "SVG stroke draw-on into fill, shape morphs, a subtle light sweep across the finished logo, one bass-hit moment. Hold the final lockup at least 3 seconds.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "youtube-intro",
    name: "YouTube Intro",
    tagline: "Channel intro with title card and subscribe nudge",
    category: "youtube",
    format: "16:9",
    duration: 15,
    prompt:
      "A punchy intro for the YouTube channel [channel name] about [topic]. Energetic title card, 2–3 flashes of what the channel covers, then the channel name and 'Subscribe'.",
    styleNotes:
      "Bold condensed type, quick zoom-punches, split-screen panels, a tape/sticker texture layer. Beat-synced cuts at ~120 BPM.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "youtube-chapter-explainer",
    name: "Explainer Chapter",
    tagline: "Diagram-driven explainer for a video chapter",
    category: "youtube",
    format: "16:9",
    duration: 60,
    prompt:
      "Explain [concept] in plain language for a YouTube video chapter: the question, a simple analogy, a step-by-step diagram of how it works, and a one-sentence takeaway.",
    styleNotes:
      "Chalkboard-meets-infographic: diagrams build piece by piece with SVG line drawing, labels slide in next to what they name, the camera pans across a large canvas between steps.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "sale-ad",
    name: "Flash Sale Ad",
    tagline: "Offer, urgency, code, shop now",
    category: "ads",
    format: "1:1",
    duration: 15,
    prompt:
      "An ad for a limited-time sale at [store]: the offer (e.g. 30% off), what's included, a countdown-style urgency beat, the promo code, and 'Shop now'.",
    styleNotes:
      "Loud and graphic: giant percentage numerals, diagonal stripes, rapid color swaps between two brand colors, elastic pops. The promo code sits in a ticket shape and holds for 2 seconds.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "testimonial-ad",
    name: "Testimonial Ad",
    tagline: "A customer quote turned into kinetic type",
    category: "ads",
    format: "9:16",
    duration: 30,
    prompt:
      "Turn this customer quote into an ad for [product]: \"[quote]\" — [name, role]. Show the quote building word by word, then the result they got, then the product and a CTA.",
    styleNotes:
      "Large quotation marks as a graphic device, words highlighted with a marker-swipe as they are spoken, star rating that fills in, calm confident pacing.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "product-comparison",
    name: "Before / After",
    tagline: "Split-screen transformation",
    category: "product",
    format: "16:9",
    duration: 30,
    prompt:
      "A before/after video for [product]: the frustrating 'before' on one side, the effortless 'after' on the other, three side-by-side comparisons, and the product name with a CTA.",
    styleNotes:
      "A vertical divider that wipes across to reveal 'after'; desaturated grey for before, full brand color for after; counters that tick up to the improvement numbers.",
    previewVideoUrl: null,
    posterUrl: null,
  },
  {
    id: "webinar-promo",
    name: "Webinar Promo",
    tagline: "Speakers, topic, date, register",
    category: "event",
    format: "1:1",
    duration: 30,
    prompt:
      "Promote a free webinar: the title [title], what attendees will learn (3 points), the speaker [name, role], the date and time, and 'Register free'.",
    styleNotes:
      "Professional and calm: a grid layout that re-arranges with Flip-style transitions, speaker photo in a circular mask, a calendar tile that flips to the date.",
    previewVideoUrl: null,
    posterUrl: null,
  },
];

export function listTemplates(category?: string | null): StudioTemplate[] {
  if (!category || category === "all") return [...STUDIO_TEMPLATES];
  return STUDIO_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplate(id: string | null | undefined): StudioTemplate | null {
  if (!id) return null;
  return STUDIO_TEMPLATES.find((t) => t.id === id) ?? null;
}

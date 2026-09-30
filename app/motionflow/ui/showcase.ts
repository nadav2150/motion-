// Every external image/video URL used by the landing page and the app's
// decorative surfaces lives here, so it is easy to audit and to swap the
// Unsplash stand-ins for real Videly-made showcase media later
// (plan: scripts/make-showcase.mjs → storyboards/showcase/).
//
// Unsplash photos are used under the Unsplash License (free for commercial
// use, no attribution required). `u()` requests a resized, compressed variant.

import type { StudioTemplate, TemplateCategory } from "../../lib/studio/types";

const u = (id: string, w: number, q = 70) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=${q}`;

export const PHOTO_IDS = {
  mountainsSunset: "photo-1506905925346-21bda4d32df4",
  mountainLake: "photo-1501785888041-af3ef285b470",
  modernHouseDusk: "photo-1613490493576-7fde63acd811",
  concertCrowd: "photo-1470229722913-7c0e2dbbafd3",
  watchProduct: "photo-1523275335684-37898b6baf30",
  headphones: "photo-1505740420928-5e560c06d30e",
  sneaker: "photo-1549298916-b41d501d3772",
  phoneApp: "photo-1512941937669-90a1b58e7e9c",
  office: "photo-1497366216548-37526070297c",
  eventLights: "photo-1492684223066-81342ee5ff30",
  creatorCamera: "photo-1492691527719-9d1e07e534b4",
  minimalCamera: "photo-1526170375885-4d8ecf77b99f",
  team: "photo-1522202176988-66273c2fd55f",
  storefront: "photo-1441986300917-64674bd600d8",
} as const;

export type PhotoKey = keyof typeof PHOTO_IDS;

export function photo(key: PhotoKey, w = 800, q = 70): string {
  return u(PHOTO_IDS[key], w, q);
}

// Hero / showcase media. `heroVideo` stays null until a real Videly-made demo
// MP4 exists; the players fall back to the poster image.
export const SHOWCASE = {
  heroVideo: null as string | null,
  heroPoster: photo("mountainsSunset", 1280, 72),
  heroPosterSmall: photo("mountainsSunset", 720, 70),
  homeHero: photo("modernHouseDusk", 1600, 70),
  ctaBackground: photo("mountainsSunset", 1600, 65),
  // "From idea to video in minutes" player — 4 selectable demos.
  demos: [
    { id: "mountains", title: "Ideas Move the World", poster: photo("mountainsSunset", 1200), video: null as string | null },
    { id: "house", title: "Home, Reimagined", poster: photo("modernHouseDusk", 1200), video: null as string | null },
    { id: "concert", title: "Live Tonight", poster: photo("concertCrowd", 1200), video: null as string | null },
    { id: "product", title: "Time, Refined", poster: photo("watchProduct", 1200), video: null as string | null },
  ],
};

// Only real customers' logos, used with their permission. Never add
// third-party brands (Spotify, Samsung, Adobe, Shopify, Canva, Notion, Figma…)
// without an actual relationship — showing them would be a false claim. While
// this is empty the landing page renders the STATS strip instead.
export const TRUSTED_LOGOS: { name: string; src: string }[] = [];

// Real, measured numbers only (e.g. videos made from PostHog). Empty → the
// whole "trusted by" section renders nothing.
export const STATS: { value: string; label: string }[] = [];

// Real user quotes, with the person's consent (name/role/photo as they
// approve). Never invent people or titles. Empty → section hidden.
export const TESTIMONIALS: { quote: string; name: string; role?: string; avatar?: string }[] = [];

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  product: "Product",
  social: "Social Media",
  brand: "Brand",
  app: "App",
  event: "Event",
  youtube: "YouTube",
  ads: "Ads",
};

// Local fallback used by the landing page (and the Templates screen in mock
// mode) until GET /api/studio/templates is live.
export const FALLBACK_TEMPLATES: StudioTemplate[] = [
  {
    id: "product-promo",
    name: "Product Promo",
    tagline: "Clean and modern",
    category: "product",
    format: "16:9",
    duration: 30,
    prompt: "A clean, modern product promo that reveals the product with smooth camera moves, three key benefits and a bold call to action.",
    styleNotes: "Soft studio light, generous negative space, confident sans headlines.",
    previewVideoUrl: null,
    posterUrl: photo("headphones", 640),
  },
  {
    id: "app-showcase",
    name: "App Showcase",
    tagline: "Highlight your product",
    category: "app",
    format: "9:16",
    duration: 30,
    prompt: "A vertical app showcase: phone mockup, UI screens sliding in, feature callouts and an App Store style ending.",
    styleNotes: "Crisp UI, bouncy but precise motion, bright accent color.",
    previewVideoUrl: null,
    posterUrl: photo("phoneApp", 640),
  },
  {
    id: "brand-story",
    name: "Brand Story",
    tagline: "Cinematic & emotional",
    category: "brand",
    format: "16:9",
    duration: 45,
    prompt: "A cinematic brand story about why we started, with slow reveals, emotional typography and a warm closing line.",
    styleNotes: "Film grain, golden-hour palette, serif display type.",
    previewVideoUrl: null,
    posterUrl: photo("mountainsSunset", 640),
  },
  {
    id: "social-ad",
    name: "Social Media Ad",
    tagline: "Short & engaging",
    category: "social",
    format: "9:16",
    duration: 15,
    prompt: "A punchy 15-second social ad with a hook in the first second, fast cuts, big captions and a clear offer.",
    styleNotes: "High contrast, kinetic captions, quick rhythm.",
    previewVideoUrl: null,
    posterUrl: photo("sneaker", 640),
  },
  {
    id: "event-teaser",
    name: "Event Teaser",
    tagline: "High energy",
    category: "event",
    format: "16:9",
    duration: 30,
    prompt: "A high-energy event teaser with a countdown, venue and date reveal, and pulsing light effects on the beat.",
    styleNotes: "Neon on dark, bold condensed type, beat-synced cuts.",
    previewVideoUrl: null,
    posterUrl: photo("concertCrowd", 640),
  },
  {
    id: "minimal-product",
    name: "Minimal Product",
    tagline: "Sleek and stylish",
    category: "product",
    format: "1:1",
    duration: 15,
    prompt: "A minimal square product loop: one hero shot, slow rotation, a single line of copy and the logo.",
    styleNotes: "Pastel backdrop, soft shadows, lots of air.",
    previewVideoUrl: null,
    posterUrl: photo("minimalCamera", 640),
  },
  {
    id: "real-estate-tour",
    name: "Property Tour",
    tagline: "Warm and inviting",
    category: "ads",
    format: "16:9",
    duration: 30,
    prompt: "A property tour ad: exterior at dusk, room highlights with elegant labels, price and contact at the end.",
    styleNotes: "Warm dusk tones, elegant serif labels, slow push-ins.",
    previewVideoUrl: null,
    posterUrl: photo("modernHouseDusk", 640),
  },
  {
    id: "youtube-intro",
    name: "YouTube Intro",
    tagline: "Hook your viewers",
    category: "youtube",
    format: "16:9",
    duration: 15,
    prompt: "A snappy YouTube channel intro with the channel name, a logo sting and a subscribe prompt.",
    styleNotes: "Energetic, playful shapes, bold colors.",
    previewVideoUrl: null,
    posterUrl: photo("creatorCamera", 640),
  },
  {
    id: "team-culture",
    name: "Team Culture",
    tagline: "People first",
    category: "brand",
    format: "16:9",
    duration: 30,
    prompt: "A recruiting video about our team culture: values as big typography, photo collages and a join-us call to action.",
    styleNotes: "Friendly, bright, rounded type.",
    previewVideoUrl: null,
    posterUrl: photo("team", 640),
  },
];

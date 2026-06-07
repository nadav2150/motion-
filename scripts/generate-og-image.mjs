// Generates public/og-image.png — the 1200×630 social card used by
// buildMeta() for og:image / twitter:image on every public page.
//
// Why a script (not a static PNG checked in blind): the card encodes brand
// palette + messaging that change over time. Re-run after a brand/copy tweak:
//   node scripts/generate-og-image.mjs
//
// Rendering path: hand-built SVG → sharp (libvips) → PNG. Fonts fall back to
// the system sans (Arial/Helvetica/DejaVu), so we avoid webfont dependencies.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "og-image.png");

// Brand palette, mirrored from app/app.css (aurora glow + near-black canvas).
const BG = "#06070A";
const BLUE = "#7AA2FF";
const PURPLE = "#A78BFA";
const CYAN = "#67E8F9";
const INK = "#FAFAFC";
const INK_DIM = "rgba(250,250,252,0.62)";

const W = 1200;
const H = 630;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowBlue" cx="82%" cy="-8%" r="60%">
      <stop offset="0%" stop-color="${BLUE}" stop-opacity="0.32"/>
      <stop offset="65%" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowPurple" cx="10%" cy="112%" r="60%">
      <stop offset="0%" stop-color="${PURPLE}" stop-opacity="0.26"/>
      <stop offset="65%" stop-color="${PURPLE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowCyan" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.08"/>
      <stop offset="70%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wordmark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BLUE}"/>
      <stop offset="55%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${CYAN}"/>
    </linearGradient>
    <linearGradient id="hr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BLUE}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${PURPLE}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>

  <!-- canvas + aurora glows -->
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glowCyan)"/>
  <rect width="${W}" height="${H}" fill="url(#glowBlue)"/>
  <rect width="${W}" height="${H}" fill="url(#glowPurple)"/>

  <!-- faint grid, masked toward the center like the site hero -->
  <g stroke="rgba(255,255,255,0.035)" stroke-width="1">
    ${Array.from({ length: 24 }, (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="${H}"/>`).join("")}
    ${Array.from({ length: 13 }, (_, i) => `<line x1="0" y1="${i * 52}" x2="${W}" y2="${i * 52}"/>`).join("")}
  </g>

  <!-- brand dot + eyebrow -->
  <circle cx="92" cy="98" r="10" fill="url(#wordmark)"/>
  <text x="116" y="106" font-family="Arial, Helvetica, sans-serif" font-size="26"
        font-weight="700" letter-spacing="2" fill="${INK}">VIDELY</text>

  <!-- headline -->
  <text x="90" y="300" font-family="Arial, Helvetica, sans-serif" font-size="78"
        font-weight="800" fill="${INK}" letter-spacing="-2">Cinematic launch videos,</text>
  <text x="90" y="392" font-family="Arial, Helvetica, sans-serif" font-size="78"
        font-weight="800" fill="url(#wordmark)" letter-spacing="-2">generated in minutes.</text>

  <!-- subhead -->
  <text x="92" y="462" font-family="Arial, Helvetica, sans-serif" font-size="32"
        font-weight="500" fill="${INK_DIM}">Turn screenshots &amp; product updates into AI motion design — no editor.</text>

  <!-- footer rule + url -->
  <rect x="92" y="520" width="420" height="2" fill="url(#hr)"/>
  <text x="92" y="566" font-family="Arial, Helvetica, sans-serif" font-size="28"
        font-weight="700" fill="${INK}">videly.io</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`Wrote ${OUT} (${W}×${H})`);

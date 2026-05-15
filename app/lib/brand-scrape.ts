// Brand identity scraper. Given any public URL, renders the page in a
// headless Chromium and extracts:
//   - palette:        3–6 brand colors (weighted by visual area, neutrals filtered)
//   - logoUrl:        best-effort logo asset (og:image / apple-touch-icon / favicon / first <img class*=logo>)
//   - headlineFont:   computed font-family of the first <h1> (or hero heading)
//   - bodyFont:       computed font-family of <body>
//   - background:     computed background-color of <body>
//   - pageTitle:      <title> text
//
// All DOM walking happens INSIDE page.evaluate so we can leverage the
// browser's CSSOM directly. The page-side code is pure JS (no imports).

import { chromium } from "playwright";

export type ScrapedBrand = {
  url: string;
  pageTitle: string | null;
  palette: string[];
  logoUrl: string | null;
  headlineFont: string | null;
  bodyFont: string | null;
  background: string | null;
};

function validateUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  return parsed;
}

export async function scrapeBrand(rawUrl: string): Promise<ScrapedBrand> {
  const url = validateUrl(rawUrl);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    // tsx (esbuild) instruments named functions with __name() at module compile
    // time; that bytecode then gets serialized into page.evaluate's runtime,
    // where __name isn't defined. Shim it as a no-op before navigation so any
    // page.evaluate body works regardless of how tsx compiled it.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as { __name?: (x: unknown) => unknown }).__name =
        (x: unknown) => x;
    });
    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    // Let above-the-fold finish painting; not waiting for networkidle since
    // many sites lazy-load forever.
    await page.waitForTimeout(1200);

    const extracted = await page.evaluate((origin: string) => {
      // NOTE: every helper here must be an arrow assigned to const — named
      // function declarations get instrumented by tsx/esbuild with __name,
      // which is undefined in the page context.
      const rgbToHex = (rgb: string): string | null => {
        const m = rgb.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a < 0.4) return null;
        const r = Math.round(parseFloat(m[1]));
        const g = Math.round(parseFloat(m[2]));
        const b = Math.round(parseFloat(m[3]));
        return (
          "#" +
          [r, g, b]
            .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"))
            .join("")
        );
      };
      const hexToHsl = (hex: string): [number, number, number] => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        const l = (max + min) / 2;
        const d = max - min;
        const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        if (d !== 0) {
          if (max === r) h = ((g - b) / d) % 6;
          else if (max === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h = (h * 60 + 360) % 360;
        }
        return [h, s, l];
      };
      const isNeutralOrUgly = (hex: string): boolean => {
        const [, s, l] = hexToHsl(hex);
        if (l < 0.04 || l > 0.96) return true;
        if (s < 0.12 && l > 0.18 && l < 0.85) return true;
        return false;
      };
      const bucket = (hex: string): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const q = (x: number) => Math.round(x / 24) * 24;
        return (
          "#" +
          [q(r), q(g), q(b)]
            .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"))
            .join("")
        );
      };
      const resolveUrl = (maybe: string | null): string | null => {
        if (!maybe) return null;
        try {
          return new URL(maybe, origin).toString();
        } catch {
          return null;
        }
      };

      // ── palette ────────────────────────────────────────────────────────
      const weights = new Map<string, { weight: number; example: string }>();
      const els = document.querySelectorAll<HTMLElement>(
        "header, nav, main, section, h1, h2, h3, button, a, [class*=hero], [class*=brand], [class*=logo], [class*=primary], [class*=accent], [class*=cta], [data-hero]",
      );
      const viewportH = window.innerHeight;
      for (const el of Array.from(els)) {
        const r = el.getBoundingClientRect();
        if (r.top > viewportH * 2.2) continue; // skip way-below-fold
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        if (area < 60) continue;
        const cs = getComputedStyle(el);
        // Background.
        const bgHex = rgbToHex(cs.backgroundColor);
        if (bgHex && !isNeutralOrUgly(bgHex)) {
          const key = bucket(bgHex);
          const prev = weights.get(key) ?? { weight: 0, example: bgHex };
          prev.weight += area;
          weights.set(key, prev);
        }
        // Text color — only if the element has non-trivial text content.
        if (el.textContent && el.textContent.trim().length > 1) {
          const textHex = rgbToHex(cs.color);
          if (textHex && !isNeutralOrUgly(textHex)) {
            const key = bucket(textHex);
            const fontSize = parseFloat(cs.fontSize) || 16;
            // Text color weighted by font-size² (headlines matter more).
            const w = fontSize * fontSize * 3;
            const prev = weights.get(key) ?? { weight: 0, example: textHex };
            prev.weight += w;
            weights.set(key, prev);
          }
        }
        // Inline SVG fills (a lot of brand color lives in icons / hero shapes).
        const svgs = el.querySelectorAll("svg [fill], svg [stroke]");
        for (let i = 0; i < Math.min(svgs.length, 12); i++) {
          const node = svgs[i] as Element;
          const fill = node.getAttribute("fill") || "";
          const stroke = node.getAttribute("stroke") || "";
          for (const c of [fill, stroke]) {
            if (!c || c === "none" || c.startsWith("url(")) continue;
            let hex = c.startsWith("#") ? c : null;
            if (!hex && /^rgb/i.test(c)) hex = rgbToHex(c);
            if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
            const lc = hex.toLowerCase();
            if (isNeutralOrUgly(lc)) continue;
            const key = bucket(lc);
            const prev = weights.get(key) ?? { weight: 0, example: lc };
            prev.weight += 800;
            weights.set(key, prev);
          }
        }
      }
      const palette = [...weights.entries()]
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 6)
        .map(([, v]) => v.example);

      // ── logo ───────────────────────────────────────────────────────────
      // 1) og:image / twitter:image
      // 2) apple-touch-icon / link rel="icon" (largest)
      // 3) first <img> with class/alt matching "logo"
      // 4) /favicon.ico fallback
      const metaContent = (name: string): string | null => {
        const el = document.querySelector(
          `meta[property="${name}"], meta[name="${name}"]`,
        );
        return el ? el.getAttribute("content") : null;
      };
      let logo: string | null = null;
      logo = logo || resolveUrl(metaContent("og:image"));
      logo = logo || resolveUrl(metaContent("twitter:image"));
      if (!logo) {
        const iconLinks = Array.from(
          document.querySelectorAll<HTMLLinkElement>(
            'link[rel*="icon"], link[rel="apple-touch-icon"]',
          ),
        );
        const ranked = iconLinks
          .map((l) => {
            const sizes = l.getAttribute("sizes") || "";
            const s = parseInt(sizes.split("x")[0] || "0", 10) || 0;
            return { href: l.href, size: s };
          })
          .sort((a, b) => b.size - a.size);
        logo = (ranked[0]?.href as string | undefined) ?? null;
      }
      if (!logo) {
        const candidates = Array.from(
          document.querySelectorAll<HTMLImageElement>("img"),
        ).filter((img) => {
          const cls = (img.className || "").toString().toLowerCase();
          const alt = (img.alt || "").toLowerCase();
          return /logo|brand/.test(cls) || /logo|brand/.test(alt);
        });
        if (candidates[0]) logo = resolveUrl(candidates[0].src);
      }
      if (!logo) logo = resolveUrl("/favicon.ico");

      // ── fonts ──────────────────────────────────────────────────────────
      const h1 = document.querySelector("h1, [class*=hero] h1, [class*=hero] h2, h2");
      const headlineFont = h1 ? getComputedStyle(h1).fontFamily : null;
      const bodyFont = getComputedStyle(document.body).fontFamily;

      // ── background ─────────────────────────────────────────────────────
      const bodyBg = rgbToHex(getComputedStyle(document.body).backgroundColor);
      const htmlBg = rgbToHex(getComputedStyle(document.documentElement).backgroundColor);
      const background = bodyBg && bodyBg !== "#000000" ? bodyBg : htmlBg;

      return {
        palette,
        logoUrl: logo,
        headlineFont,
        bodyFont,
        background,
        pageTitle: document.title || null,
      };
    }, url.origin);

    return {
      url: url.toString(),
      pageTitle: extracted.pageTitle,
      palette: extracted.palette,
      logoUrl: extracted.logoUrl,
      headlineFont: extracted.headlineFont,
      bodyFont: extracted.bodyFont,
      background: extracted.background,
    };
  } finally {
    await browser.close();
  }
}

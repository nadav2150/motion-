// Shared SEO helpers. Every public route should call buildMeta() instead of
// hand-rolling meta arrays, so we never forget OG / Twitter / canonical /
// noindex on a new page. The helper returns a React Router MetaDescriptor[]
// that the route's meta() export passes back verbatim.

import type { MetaDescriptor } from "react-router";

export const SITE_URL = "https://videly.io";
export const SITE_NAME = "Videly";
// Branded OG image. Path is relative — buildMeta() resolves it to an absolute
// URL before emitting og:image / twitter:image (FB/Twitter scrapers reject
// relative paths). User drops the actual PNG at public/og-image.png; until
// then the URL 404s and the card just renders without a preview image —
// same as today, no regression.
export const OG_IMAGE = "/og-image.png";

export type MetaOptions = {
  // Page-specific portion of the title. Helper appends " — Videly" unless
  // the title already contains "Videly", which lets the landing page lead
  // with a keyword-led headline.
  title: string;
  // 150–160 chars, keyword-led. Used identically for <meta name="description">,
  // og:description, and twitter:description so the link preview always matches
  // the SERP snippet.
  description: string;
  // Pathname only (e.g. "/", "/pricing"). Helper joins with SITE_URL for
  // canonical and og:url.
  path: string;
  // Override the default OG image when a route has a more specific visual.
  // Pass a path (e.g. "/og-pricing.png") — the helper makes it absolute.
  image?: string;
  // og:type. Default "website"; use "article" for blog posts later.
  type?: "website" | "article" | "product";
  // Auth and password-reset pages should not be indexed. Skips canonical too
  // (no point telling Google the canonical of a page it shouldn't crawl).
  noIndex?: boolean;
};

function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${path}`;
}

function buildTitle(title: string): string {
  if (title.toLowerCase().includes("videly")) return title;
  return `${title} — ${SITE_NAME}`;
}

export function buildMeta(opts: MetaOptions): MetaDescriptor[] {
  const fullTitle = buildTitle(opts.title);
  const url = absoluteUrl(opts.path);
  const image = absoluteUrl(opts.image ?? OG_IMAGE);
  const type = opts.type ?? "website";

  const out: MetaDescriptor[] = [
    { title: fullTitle },
    { name: "description", content: opts.description },

    { property: "og:title", content: fullTitle },
    { property: "og:description", content: opts.description },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: opts.description },
    { name: "twitter:image", content: image },
  ];

  if (opts.noIndex) {
    out.push({ name: "robots", content: "noindex, nofollow" });
  } else {
    // Canonical only on indexable pages. React Router accepts link tags via
    // the tagName form alongside meta entries.
    out.push({ tagName: "link", rel: "canonical", href: url });
  }

  return out;
}

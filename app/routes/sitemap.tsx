// GET /sitemap.xml — hand-built XML of the indexable public routes.
//
// The four auth/password routes (/signin, /register, /forgot-password,
// /reset-password) are deliberately excluded — buildMeta() marks them
// noindex; listing them in the sitemap would contradict that signal.
//
// lastmod uses the build/boot timestamp. Good enough for a small static
// surface: every deploy bumps it, which is the only thing a crawler needs
// to know when to recrawl.

import { SITE_URL } from "../lib/seo";

type SitemapEntry = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
};

const ENTRIES: SitemapEntry[] = [
  { path: "/",        changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "weekly", priority: "0.9" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms",   changefreq: "yearly", priority: "0.3" },
  { path: "/refund",  changefreq: "yearly", priority: "0.3" },
];

const BUILD_TIME = new Date().toISOString();

export function loader() {
  const urls = ENTRIES.map((e) => `  <url>
    <loc>${SITE_URL}${e.path}</loc>
    <lastmod>${BUILD_TIME}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

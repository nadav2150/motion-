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
import { publishedPosts } from "../lib/blog";

type SitemapEntry = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
};

const ENTRIES: SitemapEntry[] = [
  { path: "/",        changefreq: "weekly",  priority: "1.0" },
  { path: "/pricing", changefreq: "weekly",  priority: "0.9" },

  // Use-case landing pages — primary SEO surfaces. Weekly recrawl so
  // Google picks up copy iterations and (eventually) rising rank.
  { path: "/launch-videos",                changefreq: "weekly", priority: "0.8" },
  { path: "/feature-announcement-videos",  changefreq: "weekly", priority: "0.8" },
  { path: "/product-demo-videos",          changefreq: "weekly", priority: "0.8" },
  { path: "/demo-video-agency-alternative", changefreq: "weekly", priority: "0.8" },
  { path: "/saas-explainer-video",          changefreq: "weekly", priority: "0.8" },

  // Competitor comparison pages. Monthly is enough — these only change
  // when a competitor changes pricing or we update the feature table.
  { path: "/vs/loom",      changefreq: "monthly", priority: "0.7" },
  { path: "/vs/synthesia", changefreq: "monthly", priority: "0.7" },
  { path: "/vs/runway",    changefreq: "monthly", priority: "0.7" },
  { path: "/vs/pictory",   changefreq: "monthly", priority: "0.7" },
  { path: "/vs/veed",      changefreq: "monthly", priority: "0.7" },
  { path: "/loom-alternative",      changefreq: "monthly", priority: "0.7" },
  { path: "/synthesia-alternative", changefreq: "monthly", priority: "0.7" },

  { path: "/privacy", changefreq: "yearly",  priority: "0.3" },
  { path: "/terms",   changefreq: "yearly",  priority: "0.3" },
  { path: "/refund",  changefreq: "yearly",  priority: "0.3" },
];

const BUILD_TIME = new Date().toISOString();

export function loader() {
  // Blog posts are evaluated per request, so a scheduled post joins the
  // sitemap the moment its publishAt passes (within the 1h cache below).
  const posts = publishedPosts();
  const rows = [
    ...ENTRIES.map((e) => ({ ...e, lastmod: BUILD_TIME })),
    ...(posts.length
      ? [{ path: "/blog", changefreq: "weekly" as const, priority: "0.7", lastmod: posts[0].publishAt }]
      : []),
    ...posts.map((p) => ({
      path: `/blog/${p.slug}`,
      changefreq: "monthly" as const,
      priority: "0.6",
      lastmod: p.updatedAt ?? p.publishAt,
    })),
  ];
  const urls = rows.map((e) => `  <url>
    <loc>${SITE_URL}${e.path}</loc>
    <lastmod>${e.lastmod}</lastmod>
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

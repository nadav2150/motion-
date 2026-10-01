// Blog registry. Every file in ./posts is picked up at build time, and a
// post becomes visible (route, index, sitemap) once its publishAt passes.
// Publishing on a schedule therefore needs no deploy: ship posts with future
// dates and they appear on their own.

import type { BlogPost } from "./types";

export { formatPostDate, parseInline, type InlineToken } from "./inline";

const modules = import.meta.glob<{ post: BlogPost }>("./posts/*.ts", { eager: true });

const ALL_POSTS: BlogPost[] = Object.values(modules)
  .map((m) => m.post)
  .sort((a, b) => b.publishAt.localeCompare(a.publishAt));

export function isPublished(post: BlogPost, now: Date = new Date()): boolean {
  return new Date(post.publishAt).getTime() <= now.getTime();
}

// Newest first.
export function publishedPosts(now: Date = new Date()): BlogPost[] {
  return ALL_POSTS.filter((p) => isPublished(p, now));
}

export function getPublishedPost(slug: string, now: Date = new Date()): BlogPost | null {
  const post = ALL_POSTS.find((p) => p.slug === slug);
  return post && isPublished(post, now) ? post : null;
}

// Full schedule including unpublished posts, oldest first. For tooling and
// tests only; never render this to visitors.
export function scheduledPosts(): BlogPost[] {
  return [...ALL_POSTS].reverse();
}

// Posts cross-link freely, including to posts scheduled later. Until a target
// is live, its links render as plain text so visitors and crawlers never hit
// a 404; the link appears on its own once the target publishes.
export function withLiveLinks(post: BlogPost, now: Date = new Date()): BlogPost {
  const live = new Set(publishedPosts(now).map((p) => p.slug));
  const fix = (text: string) =>
    text.replace(/\[([^\]]+)\]\(\/blog\/([^)#\s]+)(#[^)\s]*)?\)/g, (all, label: string, slug: string) =>
      live.has(slug) ? all : label,
    );
  return {
    ...post,
    blocks: post.blocks.map((b) => {
      switch (b.type) {
        case "p":
        case "h2":
        case "h3":
        case "quote":
          return { ...b, text: fix(b.text) };
        case "ul":
        case "ol":
          return { ...b, items: b.items.map(fix) };
        case "table":
          return { ...b, head: b.head.map(fix), rows: b.rows.map((r) => r.map(fix)) };
        case "cta":
          return { ...b, text: fix(b.text) };
        default:
          return b;
      }
    }),
    faq: post.faq?.map((f) => ({ ...f, a: fix(f.a) })),
  };
}

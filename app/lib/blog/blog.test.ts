import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublishedPost, parseInline, publishedPosts, scheduledPosts, withLiveLinks } from "./index";
import type { BlogPost } from "./types";

// Public paths a post may link to: every route registered in app/routes.ts
// without a dynamic segment, plus the blog posts themselves.
const ROUTES_TS = readFileSync(new URL("../../routes.ts", import.meta.url), "utf-8");
const STATIC_ROUTES = new Set(
  ["/", ...[...ROUTES_TS.matchAll(/route\("([^"]+)"/g)].map((m) => `/${m[1]}`)].filter((p) => !p.includes(":")),
);

function linksIn(text: string): string[] {
  return parseInline(text).flatMap((t) => (t.kind === "link" ? [t.href] : []));
}

describe("parseInline", () => {
  it("splits links and bold from text", () => {
    expect(parseInline("See [pricing](/pricing) and **save**.")).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "pricing", href: "/pricing" },
      { kind: "text", text: " and " },
      { kind: "bold", text: "save" },
      { kind: "text", text: "." },
    ]);
  });
});

describe("schedule", () => {
  const posts = scheduledPosts();

  it("hides posts until publishAt", () => {
    const first = posts[0];
    const before = new Date(new Date(first.publishAt).getTime() - 1000);
    expect(getPublishedPost(first.slug, before)).toBeNull();
    expect(getPublishedPost(first.slug, new Date(first.publishAt))).not.toBeNull();
    expect(publishedPosts(before).some((p) => p.slug === first.slug)).toBe(false);
  });

  it("unlinks posts that are not live yet", () => {
    const [first, ...later] = posts;
    if (!later.length) return;
    const target = later[later.length - 1];
    const probe: BlogPost = {
      ...first,
      blocks: [{ type: "p", text: `Read [the guide](/blog/${target.slug}) and [pricing](/pricing).` }],
      faq: [],
    };
    const before = withLiveLinks(probe, new Date(first.publishAt));
    expect(before.blocks[0]).toEqual({ type: "p", text: "Read the guide and [pricing](/pricing)." });
    const after = withLiveLinks(probe, new Date(target.publishAt));
    expect(after.blocks[0]).toEqual(probe.blocks[0]);
  });

  it("has valid, unique publish dates", () => {
    for (const p of posts) expect(Number.isNaN(new Date(p.publishAt).getTime())).toBe(false);
    expect(new Set(posts.map((p) => p.publishAt)).size).toBe(posts.length);
  });
});

describe("post content", () => {
  const posts = scheduledPosts();
  const slugs = new Set(posts.map((p) => p.slug));

  it("has unique slugs", () => {
    expect(slugs.size).toBe(posts.length);
  });

  for (const post of posts) {
    describe(post.slug, () => {
      it("fits SERP length limits", () => {
        expect(post.metaTitle.length).toBeLessThanOrEqual(60);
        expect(post.description.length).toBeGreaterThanOrEqual(110);
        expect(post.description.length).toBeLessThanOrEqual(165);
      });

      it("has unique h2 anchors", () => {
        const ids = post.blocks.flatMap((b) => (b.type === "h2" ? [b.id] : []));
        expect(ids.length).toBeGreaterThan(2);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      });

      it("links only to pages that exist", () => {
        const texts = [
          ...post.blocks.flatMap((b) => {
            if (b.type === "p" || b.type === "h2" || b.type === "h3" || b.type === "quote") return [b.text];
            if (b.type === "ul" || b.type === "ol") return b.items;
            if (b.type === "table") return [...b.head, ...b.rows.flat()];
            if (b.type === "cta") return [b.text, `[cta](${b.href})`];
            return [];
          }),
          ...(post.faq ?? []).map((f) => f.a),
        ];
        for (const href of texts.flatMap(linksIn)) {
          if (href.startsWith("http")) {
            expect(href).toMatch(/^https:\/\//);
            continue;
          }
          const path = href.split("#")[0];
          const ok = STATIC_ROUTES.has(path) || (path.startsWith("/blog/") && slugs.has(path.slice(6)));
          expect(ok, `${post.slug} links to unknown page ${href}`).toBe(true);
        }
      });
    });
  }
});

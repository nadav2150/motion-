import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/blog.$slug";
import { BlogPostScreen, type BlogCard } from "../motionflow/screens/blog";
import { getUserFromRequest } from "../lib/auth";
import { SITE_NAME, SITE_URL, buildMeta } from "../lib/seo";
import { getPublishedPost, publishedPosts, withLiveLinks } from "../lib/blog";
import type { BlogPost } from "../lib/blog/types";

type LoaderData = { isAuthed: boolean; post: BlogPost; related: BlogCard[] };

export async function loader({ request, params }: Route.LoaderArgs) {
  // Unknown slugs and posts scheduled for later both 404, so a future post
  // can't be read (or crawled) before its publishAt.
  const found = getPublishedPost(params.slug);
  if (!found) throw data(null, { status: 404 });
  const post = withLiveLinks(found);

  const user = await getUserFromRequest(request);
  const related = publishedPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 4)
    .map(({ slug, title, excerpt, publishAt, readingMinutes }) => ({ slug, title, excerpt, publishAt, readingMinutes }));
  return data({ isAuthed: user !== null, post, related } satisfies LoaderData);
}

export function meta({ data: d }: Route.MetaArgs) {
  const post = (d as LoaderData | undefined)?.post;
  if (!post) return [{ title: "Not found — Videly" }, { name: "robots", content: "noindex" }];
  return [
    ...buildMeta({
      title: post.metaTitle,
      description: post.description,
      path: `/blog/${post.slug}`,
      type: "article",
    }),
    { property: "article:published_time", content: post.publishAt },
    ...(post.updatedAt ? [{ property: "article:modified_time", content: post.updatedAt }] : []),
  ];
}

function jsonLd(post: BlogPost): string {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.publishAt,
      dateModified: post.updatedAt ?? post.publishAt,
      mainEntityOfPage: url,
      url,
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 2, name: post.title, item: url },
      ],
    },
  ];
  if (post.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "") },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

export default function BlogPostRoute() {
  const { isAuthed, post, related } = useLoaderData() as LoaderData;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(post) }} />
      <BlogPostScreen post={post} related={related} isAuthed={isAuthed} />
    </>
  );
}

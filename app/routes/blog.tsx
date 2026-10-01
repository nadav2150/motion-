import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/blog";
import { BlogIndexScreen, type BlogCard } from "../motionflow/screens/blog";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";
import { publishedPosts } from "../lib/blog";

export function meta(_: Route.MetaArgs) {
  return buildMeta({
    title: "Blog — Product Video, Launch and Release Guides | Videly",
    description:
      "Guides, templates and examples for SaaS teams: release notes, changelogs, product demo videos, launch checklists and video marketing that gets seen.",
    path: "/blog",
  });
}

type LoaderData = { isAuthed: boolean; posts: BlogCard[] };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  // Only card fields go to the client; full post bodies stay server-side.
  const posts = publishedPosts().map(({ slug, title, excerpt, publishAt, readingMinutes }) => ({
    slug,
    title,
    excerpt,
    publishAt,
    readingMinutes,
  }));
  return data({ isAuthed: user !== null, posts } satisfies LoaderData);
}

export default function BlogRoute() {
  const { isAuthed, posts } = useLoaderData() as LoaderData;
  return <BlogIndexScreen posts={posts} isAuthed={isAuthed} />;
}

// Blog content model. Posts are plain data (one file per post under
// ./posts) rendered by app/motionflow/screens/blog-post.tsx, so copy edits
// never touch layout code.
//
// Inline text in any string field supports two marks only:
//   [label](/path-or-https-url)   link (internal paths stay in-app)
//   **bold**
// Anything else renders as literal text.

export type BlogBlock =
  | { type: "p"; text: string }
  // h2 ids become in-page anchors and the table of contents.
  | { type: "h2"; text: string; id: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "quote"; text: string }
  // Copy-paste templates (release notes, scripts). Rendered monospace with
  // whitespace preserved; no inline marks.
  | { type: "template"; title: string; text: string }
  // Mid-article call to action pointing at a Videly page.
  | { type: "cta"; title: string; text: string; href: string; label: string };

export type BlogFaq = { q: string; a: string };

export type BlogPost = {
  slug: string;
  // <h1> and Article headline.
  title: string;
  // <title> / og:title. ≤ 60 chars, primary keyword first.
  metaTitle: string;
  // meta description, 140–160 chars.
  description: string;
  // One or two sentences for the blog index card.
  excerpt: string;
  // ISO timestamp. The post 404s and stays out of the index and sitemap
  // until this moment, so scheduling a post is just setting a future date.
  publishAt: string;
  updatedAt?: string;
  readingMinutes: number;
  // Primary keyword the post targets (documentation; not rendered).
  keyword: string;
  blocks: BlogBlock[];
  faq?: BlogFaq[];
};

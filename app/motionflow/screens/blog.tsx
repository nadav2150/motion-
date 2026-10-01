// Blog index + article screens. Content arrives as plain data from the route
// loaders (see app/lib/blog); these components only own layout.
//
// SEO structure on the article page:
//   <h1> = post title, <h2> = sections (also the table of contents),
//   FAQ rendered as <details> and mirrored in FAQPage JSON-LD by the route.

import { Link } from "react-router";
import { Fragment, type ReactNode } from "react";
import { MarketingShell } from "./marketing-shell";
import { formatPostDate, parseInline } from "../../lib/blog/inline";
import type { BlogBlock, BlogFaq, BlogPost } from "../../lib/blog/types";

export type BlogCard = Pick<BlogPost, "slug" | "title" | "excerpt" | "publishAt" | "readingMinutes">;

const Inline = ({ text }: { text: string }) => (
  <>
    {parseInline(text).map((t, i) => {
      if (t.kind === "bold") return <strong key={i} className="font-semibold text-paper">{t.text}</strong>;
      if (t.kind === "link") {
        const cls = "text-coral underline decoration-coral/40 underline-offset-2 hover:decoration-coral";
        return t.href.startsWith("/") ? (
          <Link key={i} to={t.href} className={cls}>{t.text}</Link>
        ) : (
          <a key={i} href={t.href} className={cls} target="_blank" rel="noopener">{t.text}</a>
        );
      }
      return <Fragment key={i}>{t.text}</Fragment>;
    })}
  </>
);

const Block = ({ block }: { block: BlogBlock }) => {
  switch (block.type) {
    case "p":
      return <p className="text-[17px] leading-[1.75] text-silver"><Inline text={block.text} /></p>;
    case "h2":
      return (
        <h2 id={block.id} className="scroll-mt-24 pt-6 text-[28px] font-bold leading-tight tracking-[-0.02em] text-paper sm:text-[32px]">
          <Inline text={block.text} />
        </h2>
      );
    case "h3":
      return <h3 className="pt-2 text-[21px] font-semibold tracking-[-0.01em] text-paper"><Inline text={block.text} /></h3>;
    case "ul":
      return (
        <ul className="list-disc space-y-2 pl-6 text-[17px] leading-[1.7] text-silver marker:text-coral">
          {block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-2 pl-6 text-[17px] leading-[1.7] text-silver marker:text-coral">
          {block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}
        </ol>
      );
    case "table":
      return (
        <div className="vd-scroll-x overflow-x-auto rounded-xl border border-slate/60">
          <table className="w-full min-w-[520px] border-collapse text-left text-[15px]">
            <thead className="bg-ink-800">
              <tr>{block.head.map((h, i) => <th key={i} className="px-4 py-3 font-semibold text-paper"><Inline text={h} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-slate/40">
                  {row.map((c, i) => <td key={i} className="px-4 py-3 align-top text-silver"><Inline text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-coral pl-5 text-[18px] italic leading-[1.7] text-paper/90">
          <Inline text={block.text} />
        </blockquote>
      );
    case "template":
      return (
        <figure className="overflow-hidden rounded-xl border border-slate/60 bg-ink-950">
          <figcaption className="border-b border-slate/50 px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.08em] text-silver">
            {block.title}
          </figcaption>
          <pre className="vd-scroll-x overflow-x-auto whitespace-pre-wrap p-4 font-mono text-[14px] leading-[1.65] text-paper/90">{block.text}</pre>
        </figure>
      );
    case "cta":
      return (
        <aside className="rounded-2xl border border-coral/30 bg-[linear-gradient(135deg,rgb(239_131_84/0.14),rgb(79_93_117/0.18))] p-6 sm:p-8">
          <p className="text-[20px] font-bold tracking-[-0.01em] text-paper">{block.title}</p>
          <p className="mt-2 text-[16px] leading-[1.65] text-silver"><Inline text={block.text} /></p>
          <Link
            to={block.href}
            className="mt-5 inline-flex h-11 items-center rounded-full bg-coral px-6 text-[15px] font-semibold text-ink-950 transition-colors hover:bg-coral-400"
          >
            {block.label} →
          </Link>
        </aside>
      );
  }
};

const Faq = ({ faq }: { faq: BlogFaq[] }) => (
  <section className="mt-14 border-t border-slate/50 pt-10">
    <h2 id="faq" className="scroll-mt-24 text-[28px] font-bold tracking-[-0.02em] text-paper">Frequently asked questions</h2>
    <div className="mt-6">
      {faq.map((f, i) => (
        <details key={i} className="group border-t border-slate/40 py-5">
          <summary className="cursor-pointer list-none text-[17px] font-semibold text-paper">
            <span className="mr-2 text-coral group-open:hidden">+</span>
            <span className="mr-2 hidden text-coral group-open:inline">−</span>
            {f.q}
          </summary>
          <p className="mt-3 text-[16px] leading-[1.7] text-silver"><Inline text={f.a} /></p>
        </details>
      ))}
    </div>
  </section>
);

const Meta = ({ publishAt, readingMinutes }: { publishAt: string; readingMinutes: number }) => (
  <div className="font-mono text-[12px] uppercase tracking-[0.08em] text-silver/80">
    <time dateTime={publishAt}>{formatPostDate(publishAt)}</time> · {readingMinutes} min read
  </div>
);

const PageWrap = ({ isAuthed, children }: { isAuthed: boolean; children: ReactNode }) => (
  <MarketingShell isAuthed={isAuthed}>
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_10%,rgb(239_131_84/0.12),transparent_70%)]" aria-hidden />
    <div className="relative mx-auto max-w-[760px] px-4 pb-24 pt-14 sm:px-6">{children}</div>
  </MarketingShell>
);

export const BlogIndexScreen = ({ posts, isAuthed }: { posts: BlogCard[]; isAuthed: boolean }) => (
  <PageWrap isAuthed={isAuthed}>
    <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-coral">Videly blog</p>
    <h1 className="mt-3 text-[40px] font-extrabold leading-[1.05] tracking-[-0.035em] text-paper sm:text-[52px]">
      Product video, launches and release communication
    </h1>
    <p className="mt-4 max-w-[600px] text-[18px] leading-[1.6] text-silver">
      Practical guides, templates and examples for SaaS teams that ship often and want every release to be seen.
    </p>
    <div className="mt-12 flex flex-col gap-4">
      {posts.length === 0 && <p className="text-silver">The first posts are on their way.</p>}
      {posts.map((p) => (
        <Link
          key={p.slug}
          to={`/blog/${p.slug}`}
          className="group rounded-2xl border border-slate/50 bg-ink/40 p-6 transition-colors hover:border-coral/50 hover:bg-ink/70"
        >
          <Meta publishAt={p.publishAt} readingMinutes={p.readingMinutes} />
          <h2 className="mt-2 text-[22px] font-bold leading-snug tracking-[-0.015em] text-paper group-hover:text-coral-400">{p.title}</h2>
          <p className="mt-2 text-[16px] leading-[1.6] text-silver">{p.excerpt}</p>
        </Link>
      ))}
    </div>
  </PageWrap>
);

export const BlogPostScreen = ({
  post,
  related,
  isAuthed,
}: {
  post: BlogPost;
  related: BlogCard[];
  isAuthed: boolean;
}) => {
  const toc = post.blocks.filter((b): b is Extract<BlogBlock, { type: "h2" }> => b.type === "h2");
  return (
    <PageWrap isAuthed={isAuthed}>
      <nav aria-label="Breadcrumb" className="text-[14px] text-silver">
        <Link to="/blog" className="hover:text-paper">Blog</Link>
        <span className="mx-2 text-slate">/</span>
        <span className="text-silver/70">{post.title}</span>
      </nav>
      <article>
        <header className="mt-6">
          <h1 className="text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-paper sm:text-[48px]">{post.title}</h1>
          <div className="mt-5"><Meta publishAt={post.publishAt} readingMinutes={post.readingMinutes} /></div>
        </header>

        {toc.length > 2 && (
          <nav aria-label="On this page" className="mt-10 rounded-2xl border border-slate/50 bg-ink/40 p-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-silver">On this page</p>
            <ol className="mt-3 space-y-1.5 text-[15px]">
              {toc.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="text-silver hover:text-coral"><Inline text={h.text} /></a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-10 flex flex-col gap-6">
          {post.blocks.map((b, i) => <Block key={i} block={b} />)}
        </div>

        {post.faq && post.faq.length > 0 && <Faq faq={post.faq} />}
      </article>

      {related.length > 0 && (
        <section className="mt-16 border-t border-slate/50 pt-10">
          <h2 className="text-[22px] font-bold tracking-[-0.015em] text-paper">Keep reading</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {related.map((p) => (
              <Link key={p.slug} to={`/blog/${p.slug}`} className="rounded-2xl border border-slate/50 bg-ink/40 p-5 transition-colors hover:border-coral/50">
                <p className="text-[17px] font-semibold leading-snug text-paper">{p.title}</p>
                <p className="mt-2 text-[14px] leading-[1.55] text-silver">{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PageWrap>
  );
};

// GET /v/:slug — public, no-login page for a video an admin made for someone
// (e.g. a Reddit giveaway). Watch + download, then an upsell to sign up and
// make their own. Links are created in /backoffice/share or from /videos/:id.

import { useEffect } from "react";
import { data, useLoaderData } from "react-router";
import { Download, Sparkles } from "lucide-react";
import type { Route } from "./+types/v.$slug";
import { getUserFromRequest } from "../lib/auth";
import { buildMeta } from "../lib/seo";
import { track } from "../lib/analytics";
import { FREE_SIGNUP_CREDITS, PLANS } from "../lib/billing/catalog";
import { bumpSharedVideo, getSharedVideo, sharedVideoUrls } from "../lib/share";
import { CheckList, CoralLink, FinalCta, HowItWorks } from "../motionflow/screens/landing";
import { MarketingFooter, MarketingHeader } from "../motionflow/ui/marketing";

type LoaderData = {
  slug: string;
  title: string;
  recipient: string | null;
  message: string | null;
  videoUrl: string;
  thumbUrl: string | null;
  isAuthed: boolean;
};

// Link-preview scrapers (Reddit, Slack, Discord…) shouldn't count as views.
const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|slack|discord|whatsapp|telegram|embedly|curl|wget/i;

export async function loader({ request, params }: Route.LoaderArgs) {
  const row = params.slug ? await getSharedVideo(params.slug) : null;
  if (!row) throw new Response("Not found", { status: 404 });
  const [user] = await Promise.all([
    getUserFromRequest(request),
    BOT_UA.test(request.headers.get("user-agent") ?? "") ? null : bumpSharedVideo(row.slug, "views"),
  ]);
  const { videoUrl, thumbUrl } = sharedVideoUrls(row);
  return data(
    {
      slug: row.slug,
      title: row.title,
      recipient: row.recipient,
      message: row.message,
      videoUrl,
      thumbUrl,
      isAuthed: user !== null,
    } satisfies LoaderData,
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export function meta({ data: d }: Route.MetaArgs) {
  const v = d as LoaderData | undefined;
  if (!v) return [{ title: "Video not found — Videly" }, { name: "robots", content: "noindex" }];
  return [
    ...buildMeta({
      title: v.recipient ? `${v.title} — made for ${v.recipient} with Videly` : `${v.title} — made with Videly`,
      description: "Watch and download this video, made in minutes with Videly — the AI launch video generator for SaaS.",
      path: `/v/${v.slug}`,
      image: v.thumbUrl ?? undefined,
      type: "website",
      noIndex: true,
    }),
    { property: "og:video", content: v.videoUrl },
    { property: "og:video:secure_url", content: v.videoUrl },
    { property: "og:video:type", content: "video/mp4" },
  ];
}

const PAGE_BG = "#020c12";

export default function SharedVideoPage() {
  const v = useLoaderData() as LoaderData;
  const ctaHref = v.isAuthed ? "/home" : "/register";
  const props = { slug: v.slug, recipient: v.recipient };

  useEffect(() => {
    track("share_page_viewed", props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.slug]);

  // Every signup / pricing link on the page goes through here.
  const onCtaClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (href && /^\/(register|home|pricing)/.test(href)) track("share_cta_clicked", { ...props, href });
  };

  return (
    <div className="vd-root relative min-h-screen overflow-x-hidden" style={{ background: PAGE_BG }} onClickCapture={onCtaClick}>
      <MarketingHeader isAuthed={v.isAuthed} />

      <main className="mx-auto max-w-[1100px] px-4 pb-6 pt-10 sm:px-6 sm:pt-14">
        <div className="text-center">
          <p className="inline-block rounded-md bg-white/[0.04] px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.14em] text-[#f08a5d]">
            {v.recipient ? `Made for ${v.recipient}` : "Your video is ready"}
          </p>
          <h1 className="mt-4 text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-[42px]">{v.title}</h1>
          {v.message && <p className="mx-auto mt-4 max-w-[640px] whitespace-pre-line text-[16px] leading-[1.6] text-[#b9c0c4]">{v.message}</p>}
        </div>

        <div className="mt-8 overflow-hidden rounded-[20px] border border-white/[0.08] bg-black shadow-[0_30px_80px_-30px_rgb(242_112_63/0.35)]">
          <video
            src={v.videoUrl}
            poster={v.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="block max-h-[70vh] w-full bg-black"
          />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href={`/v/${v.slug}/download`}
            onClick={() => track("share_video_downloaded", props)}
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[10px] border border-white/15 bg-white/[0.06] px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.1]"
          >
            <Download className="size-4" aria-hidden />
            Download MP4
          </a>
          <CoralLink to={ctaHref}>Make your own video — free</CoralLink>
        </div>
        <p className="mt-4 text-center text-[13px] text-[#8b949a]">
          Free to use anywhere — your site, launch posts, socials. If you liked it, honest feedback in the thread means a lot 🙏
        </p>

        {/* Upsell */}
        <section className="relative mt-14 overflow-hidden rounded-[24px] border border-[#f2703f]/30 bg-[linear-gradient(135deg,rgb(242_112_63/0.14),rgb(6_21_28/0.85)_55%)] px-6 py-10 sm:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[560px]">
              <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em] text-[#f08a5d]">
                <Sparkles className="size-4" aria-hidden /> Made with Videly
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-white sm:text-[34px]">
                This video took minutes, not days. Make the next one yourself.
              </h2>
              <p className="mt-3 text-[16px] leading-[1.6] text-[#b9c0c4]">
                Describe your product or drop in screenshots — Videly turns them into a polished launch, feature or demo video. Edit it
                by chatting, then export.
              </p>
              <CheckList
                className="mt-6"
                items={[`${FREE_SIGNUP_CREDITS.toLocaleString()} free credits`, "No credit card required", "Export MP4 in HD"]}
              />
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
              <CoralLink to={ctaHref} size="lg">
                {v.isAuthed ? "Open Videly" : "Start free"}
              </CoralLink>
              <a href="/pricing" className="text-[14px] text-white/70 underline-offset-4 hover:text-white hover:underline">
                Paid plans from ${PLANS.starter.priceUsd}/mo — see pricing
              </a>
            </div>
          </div>
        </section>
      </main>

      <HowItWorks />
      <FinalCta ctaHref={ctaHref} />
      <MarketingFooter />
    </div>
  );
}

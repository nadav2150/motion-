import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "best-product-launch-videos",
  title: "The Best Product Launch Videos (and What Makes Them Work)",
  metaTitle: "Best Product Launch Videos and What Makes Them Work",
  description:
    "The best product launch videos, from Dollar Shave Club to Slack and the iPhone: what each one did well, the patterns they share, and a SaaS launch template.",
  excerpt:
    "Four widely studied product launch videos, the lesson each one teaches, and a simple structure you can use for your own SaaS launch video.",
  publishAt: "2026-10-01T06:08:00Z",
  readingMinutes: 8,
  keyword: "best product launch videos",
  blocks: [
    {
      type: "p",
      text: "The best product launch videos are rarely the most expensive ones. They are the ones that make a single idea impossible to miss. This article looks at four launch videos that marketers still study, pulls out the transferable lesson from each, and turns those lessons into a structure you can use for your own SaaS launch.",
    },
    {
      type: "p",
      text: "A note on method: we link to the original public source for every example and describe each one in general terms. We have deliberately left out the view counts and revenue figures that circulate about some of them, because they are hard to verify. The lessons do not depend on the numbers.",
    },
    {
      type: "h2",
      text: "What are the best product launch videos?",
      id: "product-launch-video-examples",
    },
    { type: "h3", text: "1. Dollar Shave Club: “Our Blades Are F***ing Great” (2012)" },
    {
      type: "p",
      text: "[Dollar Shave Club's launch video](https://www.youtube.com/watch?v=ZUG9qYTJMsI) is the one most people think of first. The founder, Michael Dubin, walks through the company's warehouse and delivers the pitch himself: razors delivered by subscription, for less than you pay at the store. It is deadpan, fast and clearly low budget, and the jokes all serve the offer rather than distracting from it.",
    },
    {
      type: "p",
      text: "**The lesson:** a launch video can carry one offer and one personality, and that is enough. The viewer leaves knowing exactly what the company sells, how it works and why it is cheaper. Humour worked because it was attached to a sharp value proposition, not a substitute for one.",
    },
    { type: "h3", text: "2. Slack: “So Yeah, We Tried Slack …” (2014)" },
    {
      type: "p",
      text: "[Slack's video](https://www.youtube.com/watch?v=B6zVzWU95Sw) was made with the production studio Sandwich Video for Slack's launch, and it is styled as a mockumentary in which the Sandwich team describes how they work since they started using Slack. James Sherrett, who worked on the script at Slack, has written up [how the video came about](https://www.slackstory.com/p/so-yeah-we-tried-slack). Instead of a feature tour, you hear people talk about what their workday used to look like and what changed.",
    },
    {
      type: "p",
      text: "**The lesson:** for a B2B tool, sell the change in how a team works, told from the user's side. The product appears, but the story is about the people. This is a good model for collaboration and workflow tools, where the benefit is a feeling (less chaos, fewer pings) that a feature list cannot convey.",
    },
    { type: "h3", text: "3. Apple: the iPhone introduction (2007)" },
    {
      type: "p",
      text: "Apple [introduced the iPhone at Macworld in January 2007](https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/). It is a keynote rather than a produced video, but it is probably the most studied product reveal there is. Steve Jobs framed the launch as three products: a widescreen iPod with touch controls, a mobile phone and an internet communications device. Then he revealed they were one device.",
    },
    {
      type: "p",
      text: "**The lesson:** frame the launch before you show it. By naming the categories the audience already understood, Apple gave people a mental model for something new. For a SaaS launch, the equivalent is anchoring your feature to the tools or habits it replaces before you show the screen.",
    },
    { type: "h3", text: "4. Dropbox: the early demo screencast (2007)" },
    {
      type: "p",
      text: "When Drew Houston posted [Dropbox to Hacker News in 2007](https://news.ycombinator.com/item?id=8863), the post (titled “My YC app: Dropbox - Throw away your USB drive”) linked to a short screencast. There was no animation or soundtrack to speak of. It simply showed a file saved on one computer appearing on another, and the discussion thread shows how a technical audience reacted to seeing it work.",
    },
    {
      type: "p",
      text: "**The lesson:** when the product does something people doubt is possible, the most persuasive launch video is proof. Show the before and after on real screens, in real time if needed, and let the audience draw the conclusion. Polish matters less than credibility.",
    },
    {
      type: "h2",
      text: "What makes a product launch video work?",
      id: "what-makes-launch-videos-work",
    },
    {
      type: "p",
      text: "Four very different videos, but the same patterns run through them:",
    },
    {
      type: "ul",
      items: [
        "**One idea.** Cheap razors by mail. A calmer team. Three devices in one. Files that sync. Each video can be summarised in a sentence.",
        "**The product is the hero, not the company.** None of them spends long on mission statements or company history.",
        "**A clear point of view.** Funny, warm, theatrical or plain: the tone is a choice, held for the whole video.",
        "**Familiar framing.** Each anchors the new thing to something the viewer already knows: the store-bought razor, email and chat sprawl, the phone in your pocket, the USB stick.",
        "**Proof over adjectives.** Showing the product working (or showing the people it changed) does more than calling it revolutionary.",
        "**Made for where it was shown.** A keynote stage, a YouTube link shared by friends, a forum post for developers. Format followed distribution.",
      ],
    },
    {
      type: "h2",
      text: "How do you make a product launch video for a SaaS product?",
      id: "how-to-make-a-saas-launch-video",
    },
    {
      type: "p",
      text: "Most SaaS teams are not launching a new company every week. They are launching a product on Product Hunt, a major release, or a new plan. That changes the brief: you need a product launch video you can make in days, refresh as the UI changes, and cut for several channels.",
    },
    {
      type: "ol",
      items: [
        "**Write the one-sentence idea first.** “[Product] now [does X] so [audience] can [outcome].” If you cannot write it, the video will not fix that.",
        "**Pick your angle from the examples above.** Founder on camera (Dollar Shave Club), user story (Slack), framing and reveal (iPhone), or pure proof (Dropbox). Most SaaS launches land on reveal plus proof.",
        "**Capture the hero screens.** Two to five screenshots that show the new thing working, with realistic data. These are your visual proof.",
        "**Script to 30–60 seconds.** Launch videos get watched on social feeds and launch pages where attention is short. Save depth for the demo.",
        "**Storyboard before you produce.** Line up every sentence of the script with a screen, zoom or caption.",
        "**Produce once, export three ways.** 16:9 for the landing page and YouTube, 1:1 for LinkedIn and X feeds, 9:16 for Stories, Reels and Shorts.",
        "**Add captions.** Feeds often autoplay muted, so the video needs to make sense without sound.",
        "**Ship it with the launch, not after.** The video belongs on the launch page, the Product Hunt gallery, the email and the social posts on day one.",
      ],
    },
    {
      type: "p",
      text: "If the launch is part of a bigger plan, the [SaaS product launch checklist](/blog/saas-product-launch-checklist) covers what else needs to be ready, and [how to launch on Product Hunt](/blog/how-to-launch-on-product-hunt) covers the gallery and maker comment in detail.",
    },
    {
      type: "cta",
      title: "Make your launch video from screenshots",
      text: "Videly turns your screenshots or product URL and a short script into a motion-designed launch video, with a storyboard to approve first and exports in 16:9, 1:1 and 9:16.",
      href: "/launch-videos",
      label: "See launch videos",
    },
    {
      type: "h2",
      text: "Product launch video template",
      id: "product-launch-video-template",
    },
    {
      type: "p",
      text: "This structure combines the framing of the iPhone reveal with the proof-first approach of the Dropbox demo. It is sized for a 45-second new product launch video, about 90–110 spoken words if you use voice-over, or the same beats as on-screen text.",
    },
    {
      type: "template",
      title: "45-second launch video structure",
      text: "1. FRAME (0:00-0:05)\nName the old way the viewer knows.\n\"Your team still [old habit / tool juggling].\"\n\n2. REVEAL (0:05-0:12)\nProduct or feature name plus the one-sentence idea.\n\"Meet [Product]: [does X] so you can [outcome].\"\n\n3. PROOF (0:12-0:35)\nTwo or three screens showing it working.\nScreen 1: [starting point]\nScreen 2: [the new thing in action]\nScreen 3: [the result]\nOne short caption per screen.\n\n4. WHO IT'S FOR (0:35-0:40)\n\"Built for [audience] who [situation].\"\n\n5. CALL TO ACTION (0:40-0:45)\nOne action, plus launch context.\n\"Try it free today at [domain]\" / \"Live now - support us on Product Hunt.\"\n\nEXPORTS: 16:9 (site, YouTube), 1:1 (feeds), 9:16 (Stories, Shorts)\nCAPTIONS: on, burned in for social",
    },
    {
      type: "h2",
      text: "Common product launch video mistakes",
      id: "launch-video-mistakes",
    },
    {
      type: "ul",
      items: [
        "**Opening with the logo.** The first seconds decide whether people keep watching. Open on the problem or the reveal.",
        "**Trying to show everything.** A launch video is a trailer. Pick the one capability that justifies the launch.",
        "**Borrowing a tone you cannot hold.** Dollar Shave Club's humour worked because it matched the founder and the brand. Forced jokes read as forced.",
        "**Mock-ups that do not match the product.** If the video promises a UI the user cannot find after signing up, you lose trust at the worst moment.",
        "**One aspect ratio.** A 16:9 video in a vertical feed becomes a small strip in the middle of the screen.",
        "**Missing the date.** A launch video that arrives a week after the launch announcement misses most of the attention it was made for.",
      ],
    },
    {
      type: "h2",
      text: "Where should you use your launch video?",
      id: "where-to-use-launch-video",
    },
    {
      type: "p",
      text: "Plan the placements before you produce, because each one changes the cut. For the website placement, see our guide to [landing page video](/blog/landing-page-video).",
    },
    {
      type: "table",
      head: ["Placement", "Format", "Notes"],
      rows: [
        ["Launch landing page", "16:9, 30–60s", "Above the fold or right below the headline."],
        ["Product Hunt gallery", "16:9", "Lead with the product; the tagline sits right above it."],
        ["LinkedIn and X", "1:1 or 16:9, captions on", "Short; the first frame should work as a thumbnail."],
        ["Reels, Shorts, TikTok", "9:16, under 30s", "Fastest cut; text on screen does the talking."],
        ["Launch email", "Thumbnail linking to the page", "Most email clients do not play embedded video."],
        ["In-app announcement", "Short loop or GIF-style clip", "Show the feature where it lives."],
      ],
    },
    {
      type: "p",
      text: "For launches that are really a single new feature inside an existing product, the format is closer to a [feature announcement video](/feature-announcement-videos): shorter, more specific, and aimed at people who already know you.",
    },
    {
      type: "cta",
      title: "Your next launch, on video",
      text: "Start on the free plan with 3,100 credits a month. Paid plans start at $19/month.",
      href: "/register",
      label: "Create a launch video",
    },
  ],
  faq: [
    {
      q: "How long should a product launch video be?",
      a: "For most SaaS launches, 30–60 seconds. That is enough to frame the problem, reveal the product and show proof. Longer walkthroughs belong in a demo video linked from the launch page.",
    },
    {
      q: "What should a new product launch video include?",
      a: "A familiar frame (the old way), the reveal with a one-sentence idea, two or three screens of proof, who it is for, and one call to action. Add captions and export for each channel you will post on.",
    },
    {
      q: "Do I need a big budget for a good launch video?",
      a: "No. Dollar Shave Club's launch video was famously low budget and Dropbox's early demo was a plain screencast. What they share is a clear idea and a clear point of view, not production spend.",
    },
    {
      q: "What is the difference between a launch video and an explainer video?",
      a: "A launch video announces something new and creates a moment, so it is short and built around a reveal. An explainer is evergreen: it teaches what the product does to anyone landing on your site. Many teams adapt the launch video into the explainer later.",
    },
    {
      q: "Which aspect ratio should a launch video use?",
      a: "Make a 16:9 master for your site and YouTube, then 1:1 for social feeds and 9:16 for vertical platforms. Videly exports all three from the same project.",
    },
  ],
};

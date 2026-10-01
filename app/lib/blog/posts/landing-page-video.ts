import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "landing-page-video",
  title: "Landing Page Video: Best Practices + 5 Real Examples",
  metaTitle: "Landing Page Video: Best Practices + 5 Real Examples",
  description:
    "How to use a landing page video well: hero vs below the fold, length, autoplay and captions, poster frames, page speed, accessibility, plus 5 real examples.",
  excerpt:
    "Where to put a landing page video, how long to make it, how to autoplay it without hurting page speed or accessibility, and five real landing pages that use video well.",
  publishAt: "2026-10-08T06:00:00Z",
  readingMinutes: 9,
  keyword: "landing page video",
  blocks: [
    {
      type: "p",
      text: "A **landing page video** can explain your product faster than any headline, or it can slow the page down and get ignored. The difference is mostly in the details: where it sits, how long it runs, whether it plays on its own, and how it is loaded. This guide covers those decisions for SaaS landing pages, with copy-paste markup and five real landing page examples with video.",
    },
    { type: "h2", text: "Should your landing page have a video?", id: "should-you-use-video" },
    {
      type: "p",
      text: "Video earns its place when your product is easier to show than to describe. That is true for most software: a few seconds of the interface in motion answers 'what does it actually look like?' better than three paragraphs. It is especially useful when:",
    },
    {
      type: "ul",
      items: [
        "Your product is new or the category is unfamiliar, so visitors need to see it to understand it.",
        "The core value is a workflow (click, then this happens) rather than a single screen.",
        "Visitors arrive from ads or social posts and decide quickly whether to stay.",
        "You sell to buyers who want proof the product exists and works before booking a call.",
      ],
    },
    {
      type: "p",
      text: "Skip it, or keep it small, if the video would only show stock footage, a talking head repeating the headline, or an animated logo. A video that adds no information is just a heavier page.",
    },
    { type: "h2", text: "Where to put a landing page video: hero or below the fold?", id: "video-placement" },
    {
      type: "p",
      text: "There are two common placements, and they do different jobs.",
    },
    { type: "h3", text: "In the hero" },
    {
      type: "p",
      text: "A video in the hero is the first thing visitors see next to your headline and call to action. It works best as a short, silent, looping clip of the product in use, so it reinforces the headline instead of competing with it. Keep the primary button visible next to or above it; the video supports the call to action, it does not replace it.",
    },
    { type: "h3", text: "Below the fold" },
    {
      type: "p",
      text: "Further down the page, video works well for explaining specific features. Short loops placed beside each feature description let visitors see each one in action as they scroll. A longer click-to-play demo or explainer fits here too, for visitors who are interested enough to scroll and want the full walkthrough.",
    },
    {
      type: "p",
      text: "A common, effective setup is both: a short ambient loop in the hero, and a fuller click-to-play [product demo video](/product-demo-videos) lower on the page or behind a 'Watch demo' button.",
    },
    { type: "h2", text: "How long should a landing page video be?", id: "video-length" },
    {
      type: "table",
      head: ["Video type", "Typical length", "Playback"],
      rows: [
        ["Hero loop", "Roughly 5 to 30 seconds", "Autoplay, muted, looping"],
        ["Feature loop", "Roughly 3 to 15 seconds", "Autoplay when scrolled into view, muted"],
        ["Explainer", "Roughly 60 to 90 seconds", "Click to play, sound on"],
        ["Full product demo", "A few minutes", "Click to play, often on its own page"],
      ],
    },
    {
      type: "p",
      text: "These are working ranges, not rules. The real test is whether every second shows something new. If a scene repeats what the previous one said, cut it. For loops, make the last frame flow back into the first so the restart is not jarring.",
    },
    { type: "h2", text: "Autoplay, sound and captions", id: "autoplay-and-captions" },
    {
      type: "p",
      text: "Browsers generally block autoplay with sound, so an autoplaying landing page video must be muted. On iOS it also needs the playsinline attribute, or it will try to open full screen. That means your hero video has to make sense with no audio at all.",
    },
    {
      type: "ul",
      items: [
        "**Design for silence.** Use on-screen text, highlights and zooms to tell the story, rather than relying on narration.",
        "**Burn in captions for autoplay loops.** A muted video with voice-over is useless without captions visible on screen.",
        "**Add a caption track for click-to-play videos.** Use a WebVTT file with a track element so viewers can turn captions on, and so the video is accessible to deaf and hard-of-hearing visitors.",
        "**Never autoplay with sound.** Even where it might work, it is a reliable way to make people close the tab.",
      ],
    },
    { type: "h2", text: "Choose a poster frame that works on its own", id: "poster-frame" },
    {
      type: "p",
      text: "The poster is the still image shown before the video plays or loads. Many visitors will only ever see the poster: on slow connections, with data saver on, or when they scroll past before playback starts. Treat it as a designed image, not a random first frame.",
    },
    {
      type: "ul",
      items: [
        "Pick a frame that shows the product's key screen clearly.",
        "Export it as an optimised WebP or AVIF at the size it is displayed, not a full-resolution screenshot.",
        "For click-to-play videos, add a clear play button and the video length, so visitors know what they are committing to.",
        "Match the poster's aspect ratio to the video so nothing jumps when playback begins.",
      ],
    },
    { type: "h2", text: "Landing page video performance: keep the page fast", id: "video-performance" },
    {
      type: "p",
      text: "A video is usually the heaviest thing on a landing page. Handled carelessly, it slows the first render, hurts Core Web Vitals and costs mobile visitors their data. A few habits avoid most of that.",
    },
    { type: "h3", text: "Don't let the video block LCP" },
    {
      type: "p",
      text: "Largest Contentful Paint measures when the biggest visible element finishes rendering. For a hero video, that element is usually the poster image or first frame. Make the poster small and fast, and load it early so the hero looks complete before the video file arrives. The video itself can stream in afterwards.",
    },
    { type: "h3", text: "Lazy load everything below the fold" },
    {
      type: "p",
      text: "Videos further down the page should not download until the visitor scrolls near them. Use preload='none' and start playback with an IntersectionObserver when the video enters the viewport. For YouTube, Vimeo or Wistia embeds, show a lightweight thumbnail facade and only load the player iframe on click; embedded players pull in a lot of script.",
    },
    { type: "h3", text: "Keep file sizes small" },
    {
      type: "ul",
      items: [
        "Export hero loops at the size they are displayed, and keep them short.",
        "Remove the audio track from silent loops entirely.",
        "Serve H.264 MP4 for broad compatibility, with a WebM or AV1 source first for browsers that support it.",
        "Serve from a CDN with caching headers, not from your app server.",
        "Consider a smaller version for mobile, or just the poster on very small screens.",
      ],
    },
    { type: "h3", text: "Reserve the space" },
    {
      type: "p",
      text: "Set width and height (or an aspect-ratio in CSS) on the video element so the layout does not shift when it loads. Layout shift from late-loading media is a common cause of poor Cumulative Layout Shift scores.",
    },
    {
      type: "template",
      title: "Hero video markup (muted autoplay loop)",
      text: "<video\n  autoplay\n  muted\n  loop\n  playsinline\n  preload=\"metadata\"\n  poster=\"/media/hero-poster.webp\"\n  width=\"1280\"\n  height=\"720\"\n  aria-label=\"Short demo: creating a report in three clicks\"\n>\n  <source src=\"/media/hero.webm\" type=\"video/webm\" />\n  <source src=\"/media/hero.mp4\" type=\"video/mp4\" />\n</video>",
    },
    {
      type: "template",
      title: "Click-to-play explainer with captions",
      text: "<video\n  controls\n  preload=\"none\"\n  poster=\"/media/explainer-poster.webp\"\n  width=\"1280\"\n  height=\"720\"\n>\n  <source src=\"/media/explainer.mp4\" type=\"video/mp4\" />\n  <track kind=\"captions\" src=\"/media/explainer.en.vtt\" srclang=\"en\" label=\"English\" default />\n</video>",
    },
    { type: "h2", text: "Make your landing page video accessible", id: "video-accessibility" },
    {
      type: "ul",
      items: [
        "**Give visitors a way to pause.** Under WCAG, moving content that starts automatically and lasts more than five seconds needs a way to pause, stop or hide it. A small pause button on the hero loop covers this.",
        "**Respect reduced motion.** If a visitor has prefers-reduced-motion set, show the poster instead of autoplaying.",
        "**Caption anything with speech,** and offer a transcript for longer explainers.",
        "**Label silent loops.** An aria-label that describes what the clip shows helps screen reader users; purely decorative loops can be hidden with aria-hidden.",
        "**Don't put essential information only in the video.** Your headline, pricing and call to action should all work as text.",
      ],
    },
    { type: "h2", text: "What to show in a landing page video", id: "what-to-show" },
    {
      type: "p",
      text: "For a SaaS landing page, the product is the star. A simple structure that works for most hero videos and explainers:",
    },
    {
      type: "ol",
      items: [
        "**The outcome.** Open on the finished result, such as the report, the published page or the closed ticket, so visitors see the payoff first.",
        "**The core workflow.** Two or three steps that get there, shown in the real interface with zooms on what matters.",
        "**One differentiator.** The thing competitors do not do, shown rather than claimed.",
        "**The next step.** End on your call to action text, matching the button on the page.",
      ],
    },
    {
      type: "p",
      text: "If you want a longer, narrated piece that explains the problem before the product, that is an explainer; see our guide to [SaaS explainer videos](/saas-explainer-video) for structure and scripting.",
    },
    {
      type: "cta",
      title: "Make a landing page video from screenshots",
      text: "Videly turns product screenshots or your URL plus a short script into a motion-designed video, with auto captions and exports in 16:9, 1:1 and 9:16. Approve the storyboard before it renders.",
      href: "/product-demo-videos",
      label: "Try Videly free",
    },
    { type: "h2", text: "5 landing page examples with video", id: "landing-page-video-examples" },
    {
      type: "p",
      text: "These video landing page examples are live homepages. Descriptions are based on each page's markup and layout at the time of writing, and sites change often, so treat them as patterns to look at rather than fixed templates.",
    },
    { type: "h3", text: "1. Descript: hero video with a poster" },
    {
      type: "p",
      text: "[Descript's homepage](https://www.descript.com) uses a muted, looping video in the hero with a dedicated poster image, and does not preload the video file. **Pattern:** a designed poster carries the first impression while the video loads in the background.",
    },
    { type: "h3", text: "2. Notion: product video as hero media" },
    {
      type: "p",
      text: "[Notion's homepage](https://www.notion.com) uses a muted, looping product video as the media in its hero section. **Pattern:** the hero video shows the product itself, not a brand film.",
    },
    { type: "h3", text: "3. Loom: short loops beside each feature" },
    {
      type: "p",
      text: "[Loom's homepage](https://www.loom.com) uses several small, muted, looping clips inside its feature sections, each animating one specific part of the product. **Pattern:** below-the-fold feature loops instead of one long video.",
    },
    { type: "h3", text: "4. Tella: hero product demo, lazy loaded" },
    {
      type: "p",
      text: "[Tella's homepage](https://www.tella.tv) shows a product demo video in the hero with a WebP poster, and sets its videos not to preload. **Pattern:** a performance-conscious setup where the poster renders immediately and the video follows.",
    },
    { type: "h3", text: "5. Screen Studio: the product's output as proof" },
    {
      type: "p",
      text: "[Screen Studio's homepage](https://screen.studio) opens with a hero recording and then shows a large gallery of muted, looping videos, each labelled for screen readers with what it shows. **Pattern:** for a product that creates videos, the examples are the pitch.",
    },
    { type: "h2", text: "Landing page video checklist", id: "landing-page-video-checklist" },
    {
      type: "ul",
      items: [
        "The video shows the real product, not stock footage.",
        "The hero loop is short, muted, looping and has playsinline.",
        "It makes sense with the sound off; captions are burned in or available.",
        "The poster is a designed, optimised image that works on its own.",
        "Below-the-fold videos and embeds are lazy loaded.",
        "Width and height are set, so there is no layout shift.",
        "There is a pause control and reduced-motion fallback.",
        "The call to action is visible without watching the video.",
      ],
    },
    {
      type: "p",
      text: "For more on structuring the demo itself, read [how to make a product demo video](/blog/how-to-make-a-product-demo-video).",
    },
  ],
  faq: [
    {
      q: "Does a video on a landing page improve conversions?",
      a: "It can, but it depends on the video and the page. A short clip that shows the product clearly tends to help visitors understand what you sell; a slow-loading or irrelevant video can do the opposite. The only reliable answer for your page is to A/B test it against a version without video.",
    },
    {
      q: "Should a landing page video autoplay?",
      a: "Short, silent product loops usually should autoplay, muted and with playsinline, plus a pause control. Longer explainers and demos with narration should be click-to-play, so visitors choose to watch and can hear the audio.",
    },
    {
      q: "What is the best format for a landing page video?",
      a: "MP4 with H.264 has the widest browser support. Adding a WebM or AV1 source first lets supporting browsers download a smaller file. Remove audio from silent loops and export at the size the video is displayed.",
    },
    {
      q: "Should I host landing page videos on YouTube or self-host?",
      a: "For short hero and feature loops, self-host on a CDN; embedded players add a lot of script and show third-party branding. For longer click-to-play videos, an embed is fine if you load it behind a lightweight thumbnail facade.",
    },
    {
      q: "Does a landing page video hurt SEO?",
      a: "Not by itself. Problems come from slow loading and layout shift, which affect Core Web Vitals. Use an optimised poster, lazy load anything below the fold, set dimensions on the video element, and keep important text on the page rather than inside the video.",
    },
  ],
};

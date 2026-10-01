import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "saas-explainer-video-examples",
  title: "SaaS Explainer Video Examples + a Script Template You Can Copy",
  metaTitle: "Explainer Video Examples + a SaaS Script Template",
  description:
    "Explainer video examples for SaaS: five formats compared, how to pick one, a 60–90 second script template with word counts, and a worked example script.",
  excerpt:
    "Five explainer video formats SaaS teams actually use, how to choose between them, and a 60–90 second script template with word counts per section.",
  publishAt: "2026-10-26T06:00:00Z",
  readingMinutes: 9,
  keyword: "explainer video examples",
  blocks: [
    {
      type: "p",
      text: "Most lists of explainer video examples are a wall of embeds with no explanation of why any of them work. This guide takes the opposite approach: it breaks SaaS explainers into five formats, shows when each one fits, and gives you a script template with word counts per section so you can write your own in an afternoon.",
    },
    {
      type: "p",
      text: "If you only need the template, it is in the script template section below. If you are still deciding whether you need an explainer at all, the short answer is: you need one when people land on your site and cannot tell what your product does within a few seconds.",
    },
    {
      type: "h2",
      text: "What are the main types of explainer videos?",
      id: "types-of-explainer-videos",
    },
    {
      type: "p",
      text: "Almost every SaaS explainer falls into one of five formats. They differ in cost, how fast they go out of date, and how much of your actual product they show.",
    },
    { type: "h3", text: "1. Product-UI motion explainer" },
    {
      type: "p",
      text: "Animated versions of your real interface: screens slide in, the cursor clicks, key elements zoom and highlight, text callouts explain each step. This is the format most modern SaaS homepages use, because the viewer sees the actual product rather than a metaphor for it. It works best when your UI is the selling point or when the workflow is easy to show in a few screens.",
    },
    { type: "h3", text: "2. Character animation" },
    {
      type: "p",
      text: "Illustrated characters act out a problem and its resolution. Good for abstract products (security, infrastructure, compliance) where the UI is a dashboard nobody gets excited about. The downside: custom illustration is slow and expensive to change, and the viewer can finish the video without knowing what the product looks like.",
    },
    { type: "h3", text: "3. Live action" },
    {
      type: "p",
      text: "Real people on camera, often a founder or a team using the product. It builds trust and personality fast, but needs a crew or at least a good camera, lighting and sound, and reshoots are costly. It ages well if you keep the UI on screen to a minimum.",
    },
    { type: "h3", text: "4. Whiteboard or hand-drawn" },
    {
      type: "p",
      text: "A hand sketches the explanation as the voice-over runs. It is good for teaching a concept (how a pricing model works, why a process is broken) and less good at showing a modern product, because it signals “tutorial” more than “software”.",
    },
    { type: "h3", text: "5. Screencast" },
    {
      type: "p",
      text: "A recorded walkthrough of the product with voice-over. Cheapest and fastest to make, and very credible for technical audiences, because nothing is hidden. One of the best-known examples is Dropbox's: when Drew Houston posted [Dropbox to Hacker News in 2007](https://news.ycombinator.com/item?id=8863), the post linked to a short screencast that simply showed files syncing. For a developer audience, seeing it work was the whole pitch. The weakness of raw screencasts is pacing: real-time clicks, loading states and cursor wandering make them feel long.",
    },
    {
      type: "h2",
      text: "Which explainer video format should a SaaS company choose?",
      id: "how-to-choose-explainer-format",
    },
    {
      type: "p",
      text: "Pick the format by answering three questions: what does the viewer need to believe, how often does your product change, and how much can you spend per update.",
    },
    {
      type: "table",
      head: ["Format", "Best for", "Cost to update", "Shows real product?"],
      rows: [
        ["Product-UI motion", "Homepages, feature pages, launches", "Low to medium", "Yes"],
        ["Character animation", "Abstract or invisible products", "High", "Rarely"],
        ["Live action", "Trust, founder story, brand", "High", "Sometimes"],
        ["Whiteboard", "Teaching a concept or process", "Medium", "No"],
        ["Screencast", "Technical buyers, docs, onboarding", "Very low", "Yes, unpolished"],
      ],
    },
    {
      type: "p",
      text: "For most early and growth-stage SaaS teams the answer is product-UI motion. Your interface changes every few weeks, and a format built from screenshots can be refreshed when it does. Character animation and live action make more sense once positioning is stable and you are investing in brand.",
    },
    {
      type: "p",
      text: "A useful rule: if a prospect would ask “but what does it look like?” after watching, you chose a format that hides too much of the product.",
    },
    {
      type: "h2",
      text: "How long should an explainer video be?",
      id: "explainer-video-length",
    },
    {
      type: "p",
      text: "For a homepage or landing page, aim for 60–90 seconds. That is long enough to cover problem, solution, how it works and a call to action, and short enough that most visitors who press play reach the end. Feature explainers can be shorter (30–45 seconds); onboarding explainers can run longer because the viewer has already committed.",
    },
    {
      type: "p",
      text: "To turn a target length into a word budget, a common rule of thumb is that conversational voice-over runs at roughly 130–150 spoken words per minute. So a 60-second explainer is about 130–150 words, and a 90-second one about 195–225. Explainers usually sit at the slower end, because the visuals need room to land. Read your draft aloud with a timer: if you rush, cut words rather than speeding up.",
    },
    {
      type: "h2",
      text: "Explainer video script template (60–90 seconds)",
      id: "explainer-video-script-template",
    },
    {
      type: "p",
      text: "This template follows the structure most effective explainer video scripts share: one viewer, one problem, one product, one next step. Word counts assume roughly 140 words per minute and add up to about 165–200 words, or 70–85 seconds.",
    },
    {
      type: "template",
      title: "Explainer video script template",
      text: "1. HOOK (0:00–0:08, 15–20 words)\nName the viewer and the moment of pain.\n\"If you are a [job title] who still [painful task], this is for you.\"\n\n2. PROBLEM (0:08–0:20, 25–30 words)\nDescribe what goes wrong today, in the viewer's words.\nOne concrete scene beats three abstract complaints.\n\n3. SOLUTION (0:20–0:30, 20–25 words)\nIntroduce the product by name and its one-line promise.\n\"[Product] [does the core job] so you can [outcome].\"\n\n4. HOW IT WORKS (0:30–1:00, 65–75 words)\nThree steps, each tied to a screen.\nStep 1: [action] - show [screen].\nStep 2: [action] - show [screen].\nStep 3: [action] - show [screen / result].\n\n5. WHAT CHANGES (1:00–1:10, 20–25 words)\nThe after-state. No invented numbers.\nDescribe what the viewer stops doing or can now do.\n\n6. CALL TO ACTION (1:10–1:20, 12–18 words)\nOne action only.\n\"Start free at [domain]\" or \"Book a demo at [domain].\"\n\nTOTAL: about 165-200 words, 70-85 seconds",
    },
    {
      type: "p",
      text: "Write the visual column at the same time as the words. For each line of voice-over, note which screen, highlight or caption is on screen. If a line has no visual, it is probably filler.",
    },
    {
      type: "h2",
      text: "Explainer video script example (for a fictional product)",
      id: "explainer-video-script-example",
    },
    {
      type: "p",
      text: "Here is the template filled in for **Quillbook, a fictional invoicing tool for freelance designers** invented for this article. It is not a real product or customer. Word counts are shown so you can see how each section fits the budget.",
    },
    {
      type: "template",
      title: "Worked example: Quillbook (fictional product)",
      text: "HOOK (17 words)\nVO: If you're a freelance designer, you didn't start your business to chase invoices on a Friday night.\nVISUAL: Laptop at night, inbox full of \"Re: invoice\" threads.\n\nPROBLEM (28 words)\nVO: Right now your hours live in one app, your invoices in another, and your reminders in your head. So clients pay late, and you spend evenings doing admin.\nVISUAL: Three tool windows overlapping, then a calendar with overdue dates in red.\n\nSOLUTION (22 words)\nVO: Quillbook turns your tracked hours into a finished invoice and follows up for you, so you get paid without the awkward emails.\nVISUAL: Quillbook logo, then the dashboard.\n\nHOW IT WORKS (68 words)\nVO: Step one: connect your time tracker, or log hours right in Quillbook. Every project keeps its own rate. Step two: when a project wraps, click Create invoice. Quillbook fills in the hours, rates and client details, and applies your logo and payment terms. Step three: send it. If the client hasn't paid by the due date, Quillbook sends a polite reminder for you, on the schedule you choose.\nVISUAL: Zoom on time entries; cursor clicks Create invoice; invoice builds line by line; reminder toggle switches on.\n\nWHAT CHANGES (23 words)\nVO: No more copying hours into spreadsheets, and no more writing follow-ups yourself. You see who has paid, and who hasn't, at a glance.\nVISUAL: Invoice list with Paid and Due badges.\n\nCALL TO ACTION (12 words)\nVO: Send your first invoice in minutes. Start free at quillbook dot example.\nVISUAL: End card with URL and button.\n\nTOTAL: 170 words, roughly 75 seconds at 140 wpm",
    },
    {
      type: "p",
      text: "Notice what the example avoids: no stats it cannot back up, no list of ten features, no jargon. The “what changes” section describes tasks that disappear rather than inventing a percentage. That is a good habit for any explainer you publish under your company's name.",
    },
    {
      type: "cta",
      title: "Turn your script into an explainer",
      text: "Videly builds motion-designed explainers from your screenshots or product URL plus a short script, and shows you a storyboard to approve before it renders.",
      href: "/saas-explainer-video",
      label: "See SaaS explainer videos",
    },
    {
      type: "h2",
      text: "How to make an explainer video, step by step",
      id: "how-to-make-an-explainer-video",
    },
    {
      type: "ol",
      items: [
        "**Write a one-sentence brief.** Who is watching, where (homepage, ad, onboarding email), and what they should do next. Everything else follows from this.",
        "**Pick the format** using the table above. For most SaaS products, product-UI motion or a polished screencast.",
        "**Draft the script with the template.** Fill every section, then cut. Read it aloud with a timer and trim until it fits without rushing.",
        "**Capture clean screens.** Use realistic demo data, hide personal information, close notifications, and use a consistent browser size. One screenshot per step in “how it works” is the minimum.",
        "**Storyboard.** Pair each line of voice-over with a visual. Mark where you want zooms, highlights and text callouts. This is the cheapest point to catch problems.",
        "**Add voice and captions.** Record a human voice-over, use an AI voice, or go text-only. Add captions either way, since many viewers watch muted.",
        "**Produce and review.** Check pacing first, then brand (logo, colours, fonts), then typos. Watch it once on a phone.",
        "**Export for each placement.** 16:9 for the website and YouTube, 1:1 or 9:16 for social cut-downs.",
        "**Publish and measure.** Track play rate and how far people watch, then fix the section where viewers drop off.",
      ],
    },
    {
      type: "p",
      text: "Steps 4 to 8 are where most of the time goes when you work with an agency or an editor. A tool like Videly compresses them: you give it screenshots or a URL and the script, approve the storyboard, and it handles motion, brand kit, captions and the three aspect ratios. If you are weighing that trade-off, see [how it compares to hiring a demo video agency](/demo-video-agency-alternative).",
    },
    {
      type: "h2",
      text: "What makes explainer video examples actually work?",
      id: "what-makes-explainers-work",
    },
    {
      type: "p",
      text: "Across the formats, the explainers people remember share a few traits:",
    },
    {
      type: "ul",
      items: [
        "**One viewer.** The script speaks to a specific role with a specific problem, not “businesses of all sizes”.",
        "**The product appears early.** Ideally by the 20–30 second mark. Long metaphors before the reveal lose people.",
        "**Three steps, not ten features.** The viewer should be able to repeat how it works after one watch.",
        "**Visuals carry the detail.** The voice-over says what is happening; the screen shows how. Never read UI labels aloud word for word.",
        "**A single call to action.** Free trial or demo, not both.",
        "**Honest claims.** Describe outcomes in terms of tasks removed or time back in the viewer's day, without numbers you cannot source.",
      ],
    },
    {
      type: "p",
      text: "For more on the visual side, see our [motion graphics examples](/blog/motion-graphics-examples) and the guide to [putting a video on your landing page](/blog/landing-page-video). If your explainer is really a walkthrough, [how to make a product demo video](/blog/how-to-make-a-product-demo-video) covers the differences.",
    },
    {
      type: "h2",
      text: "Common explainer video script mistakes",
      id: "explainer-script-mistakes",
    },
    {
      type: "ul",
      items: [
        "**Opening with the company name.** Open with the viewer's problem; the name means nothing yet.",
        "**Too many words.** Going over budget forces a fast read, which feels like an ad and tires the viewer.",
        "**Feature lists.** Each extra feature dilutes the one that sells.",
        "**Vague benefits.** “Boost productivity” could describe any product. Name the task that goes away.",
        "**Dated UI.** If the video shows last year's interface, new users notice. Choose a format you can refresh.",
        "**No captions.** Plenty of autoplaying video on social and websites starts muted.",
      ],
    },
    {
      type: "cta",
      title: "Make your first explainer free",
      text: "The free plan includes 3,100 credits a month. Bring screenshots or a URL and the script you just wrote.",
      href: "/register",
      label: "Start free",
    },
  ],
  faq: [
    {
      q: "What is a good explainer video script length?",
      a: "For a 60–90 second explainer, plan for roughly 130–225 words. A common rule of thumb is 130–150 spoken words per minute, and explainers usually sit at the slower end so the visuals have time to land.",
    },
    {
      q: "Which explainer video format is best for SaaS?",
      a: "For most SaaS products, a product-UI motion explainer: it shows the real interface, is easier to update when the product changes, and answers “what does it look like?” Character animation suits abstract products where the UI is not the selling point.",
    },
    {
      q: "Should an explainer video have a voice-over?",
      a: "Usually yes, but always add captions too, because many viewers watch with sound off. A text-and-motion version without voice can work well for social placements.",
    },
    {
      q: "How is an explainer video different from a product demo?",
      a: "An explainer sells the idea: problem, solution, how it works at a high level, in about a minute. A demo goes deeper into real workflows for people who are already evaluating the product, and can run several minutes.",
    },
    {
      q: "How do I make an explainer video without an agency?",
      a: "Write the script with a template, capture clean screenshots, storyboard each line, then use an editor or an AI tool to add motion, captions and voice. Videly does the production part from screenshots or a product URL plus your script.",
    },
  ],
};

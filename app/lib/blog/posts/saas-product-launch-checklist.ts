import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "saas-product-launch-checklist",
  title: "SaaS Product Launch Checklist (+ Launch Strategy Template)",
  metaTitle: "SaaS Product Launch Checklist + Strategy Template",
  description:
    "A SaaS product launch checklist by phase, from six weeks out to post-launch, plus a copy-paste launch strategy template, launch tiers, channels and assets.",
  excerpt:
    "A phase-by-phase product launch checklist for SaaS teams, with a launch plan template, a simple tiering system for major and minor releases, and the assets every launch needs.",
  publishAt: "2026-10-19T06:00:00Z",
  readingMinutes: 8,
  keyword: "product launch checklist",
  blocks: [
    {
      type: "p",
      text: "A product launch checklist is the difference between a launch and a release that quietly slips out on a Tuesday. Most SaaS teams ship constantly, so the hard part is not shipping. It is deciding which releases deserve a real launch, then making sure the page, the email, the video, the support docs and the sales team are all ready on the same day.",
    },
    {
      type: "p",
      text: "This guide gives you a product launch strategy in three parts: a tiering system to decide how big each launch should be, a checklist organised by phase, and a launch plan template you can copy into your project tool.",
    },
    {
      type: "h2",
      text: "What is a product launch strategy for SaaS?",
      id: "what-is-a-product-launch-strategy",
    },
    {
      type: "p",
      text: "A product launch strategy answers four questions before any work starts: who is this for, what should they do after hearing about it, which channels reach them, and how big should this launch be? Everything on the checklist flows from those answers. A launch for existing customers looks very different from a launch aimed at a new market segment.",
    },
    {
      type: "p",
      text: "Write the answers down in a one-page brief. It keeps marketing, product, sales and support working from the same story, and it gives you something to measure against afterwards.",
    },
    {
      type: "h2",
      text: "How do you decide how big a launch should be?",
      id: "launch-tiers",
    },
    {
      type: "p",
      text: "Not every release needs a press push. A simple three-tier system stops you over-investing in small updates and under-investing in big ones.",
    },
    {
      type: "table",
      head: ["Tier", "What qualifies", "Typical effort"],
      rows: [
        [
          "Tier 1: major launch",
          "New product, new pricing, a feature that opens a new segment or changes your positioning",
          "Full checklist, 6 or more weeks of prep, launch video, landing page, email, social, community launch, sales enablement",
        ],
        [
          "Tier 2: minor launch",
          "A significant feature existing customers have asked for, a major integration",
          "2 to 3 weeks of prep, feature page or blog post, short feature video, email to relevant users, in-app announcement",
        ],
        [
          "Tier 3: patch or improvement",
          "Quality-of-life changes, small features, fixes",
          "Changelog entry, release notes, optional in-app tooltip or social post",
        ],
      ],
    },
    {
      type: "p",
      text: "Decide the tier when the work is scoped, not the week before it ships. That gives marketing the lead time a Tier 1 launch needs. For Tier 3 updates, a good changelog does most of the work; see our [changelog examples](/blog/changelog-examples) and [release notes template](/blog/release-notes-template).",
    },
    {
      type: "h2",
      text: "Product launch checklist: 6 to 4 weeks out",
      id: "six-to-four-weeks-out",
    },
    {
      type: "p",
      text: "This phase is about strategy and positioning. If the story is not clear now, no amount of assets will fix it later.",
    },
    {
      type: "ul",
      items: [
        "Confirm the launch tier and a target launch date, with a fallback date.",
        "Name an owner for the launch overall, and an owner for each workstream (product, marketing, sales, support).",
        "Write the launch brief: audience, problem, key message, proof points, primary call to action.",
        "Draft positioning and messaging: one-line description, three supporting benefits, and how it differs from alternatives.",
        "Decide the success metrics you will check after launch, such as sign-ups, activations, feature adoption or pipeline.",
        "Pick channels based on where the audience already is (see the channels section below).",
        "Line up beta users or design partners who can give feedback and, with permission, early quotes.",
        "Book any external dates that need lead time: partner announcements, webinars, community launches.",
      ],
    },
    {
      type: "h2",
      text: "Product launch checklist: 2 weeks out",
      id: "two-weeks-out",
    },
    {
      type: "p",
      text: "Now the story turns into assets. Aim to have drafts of everything by the end of this phase so the final week is for review, not creation.",
    },
    {
      type: "ul",
      items: [
        "Landing page or feature page drafted, with screenshots from the near-final UI.",
        "Launch video scripted and produced in the formats you need (16:9 for site and YouTube, 1:1 or 9:16 for social).",
        "Announcement email to customers and, if relevant, a separate one for prospects.",
        "Blog post or announcement post drafted.",
        "Social posts drafted for each channel, including short video cuts.",
        "In-app announcement or tooltip written.",
        "Help-centre articles and release notes written.",
        "Sales enablement: one-page summary, talk track, updated demo, answers to likely objections.",
        "Support briefed with an FAQ and known limitations.",
        "Pricing, plan limits and billing changes tested end to end, if any.",
      ],
    },
    {
      type: "h2",
      text: "Product launch checklist: launch week",
      id: "launch-week",
    },
    {
      type: "ul",
      items: [
        "Final review of every asset against the launch brief. Does each one tell the same story?",
        "Check the feature is behind a flag or ready to switch on, and that rollback is possible.",
        "Schedule emails, social posts and the blog post. Double-check time zones.",
        "Test every link, sign-up flow and tracking parameter.",
        "Prepare the launch-day rota: who monitors support, social, community comments and error logs, and when.",
        "Give advance notice to close supporters, partners and power users so they know what is coming.",
        "If you are launching on Product Hunt, finalise the listing and first comment (see our guide on [how to launch on Product Hunt](/blog/how-to-launch-on-product-hunt)).",
      ],
    },
    {
      type: "h2",
      text: "Product launch checklist: launch day",
      id: "launch-day",
    },
    {
      type: "ol",
      items: [
        "Switch the feature on and confirm it works in production with a real account.",
        "Publish the landing page, blog post and release notes.",
        "Send the announcement email and publish the in-app announcement.",
        "Post on social channels, starting with the launch video.",
        "Share in communities where you are a genuine member, following each community's rules.",
        "Reply to every comment, question and support ticket quickly. Founders and PMs replying personally goes a long way.",
        "Log feedback, bugs and objections in one shared place as they come in.",
        "Check sign-ups, errors and conversion at set times during the day, not constantly.",
      ],
    },
    {
      type: "h2",
      text: "Product launch checklist: after launch",
      id: "after-launch",
    },
    {
      type: "ul",
      items: [
        "Thank everyone who helped, publicly where appropriate.",
        "Follow up with users who signed up or tried the feature, and ask what made them try it.",
        "Fix the top issues raised on launch day and tell people when you have.",
        "Repurpose launch content: clip the video into shorter social cuts, turn FAQs into help articles, write a case study once a customer has results they are happy to share.",
        "Measure against the success metrics from the brief, at one week and again at four or more weeks.",
        "Run a short retrospective: what worked, what did not, what to change in the checklist next time.",
      ],
    },
    {
      type: "h2",
      text: "Which launch channels should a SaaS company use?",
      id: "launch-channels",
    },
    {
      type: "p",
      text: "Choose channels where your audience already pays attention, and prioritise the ones you own. Owned channels reach people who already trust you; borrowed channels reach new people but on someone else's terms.",
    },
    {
      type: "table",
      head: ["Channel", "Best for", "Notes"],
      rows: [
        ["Email to customers", "All tiers", "Segment by who will actually use the feature"],
        ["In-app announcement", "Tier 1 and 2", "Reaches active users at the moment they can try it"],
        ["Website and blog", "All tiers", "The permanent home every other channel links to"],
        ["Changelog", "All tiers", "Builds a visible record of momentum"],
        ["LinkedIn and X", "Tier 1 and 2", "Video and founder posts tend to travel further than brand posts"],
        ["Product Hunt and communities", "Tier 1", "Prepare well; launch once per meaningful release"],
        ["Partners and integrations", "Tier 1 and 2", "Co-announce with the partner when an integration ships"],
        ["Sales outreach", "Tier 1 and 2", "Send to open deals where the feature removes an objection"],
      ],
    },
    {
      type: "h2",
      text: "What assets does a SaaS product launch need?",
      id: "launch-assets",
    },
    {
      type: "p",
      text: "For a Tier 1 launch, plan for all of these. For Tier 2, pick the ones that match your channels.",
    },
    {
      type: "ul",
      items: [
        "**Launch video.** The single asset that works across the landing page, social, email, Product Hunt and sales. Make a main 16:9 cut plus square or vertical versions.",
        "**Landing or feature page.** Headline, the problem, how it works, proof, call to action.",
        "**Screenshots and GIFs.** Clean, high-resolution, with realistic data.",
        "**Announcement email.** Short, with one call to action and the video thumbnail linking to the page.",
        "**Blog post.** The story behind the release and how to get started.",
        "**Social posts.** Native video, a short thread or carousel, and a founder post.",
        "**Release notes and help docs.** So users who try it can actually succeed.",
        "**Sales one-pager and updated demo.** So the team can talk about it the same day.",
      ],
    },
    {
      type: "p",
      text: "The launch video is usually the asset teams cut when time runs short, because traditional production takes weeks. It does not have to. Tools like [Videly](/) generate a motion-designed launch video from your screenshots or product URL plus a short script, show a storyboard before rendering, and export 16:9, 1:1 and 9:16 versions with your brand kit and captions.",
    },
    {
      type: "cta",
      title: "Make the launch video in an afternoon",
      text: "Upload screenshots, write a few lines, approve the storyboard, and export every format you need for launch day.",
      href: "/launch-videos",
      label: "Create a launch video",
    },
    {
      type: "h2",
      text: "Launch strategy template",
      id: "launch-strategy-template",
    },
    {
      type: "p",
      text: "Copy this into a doc or your project tool at the start of every Tier 1 or Tier 2 launch.",
    },
    {
      type: "template",
      title: "Product launch plan",
      text: "PRODUCT LAUNCH PLAN\n\nLaunch name: \nTier: [1 major / 2 minor / 3 patch]\nLaunch date: \nFallback date: \nLaunch owner: \n\n1. BRIEF\nAudience: \nProblem it solves: \nKey message (one sentence): \nSupporting points (3): \n  - \n  - \n  - \nPrimary call to action: \nSuccess metrics (1 week / 4+ weeks): \n\n2. OWNERS\nProduct: \nMarketing: \nSales: \nSupport: \n\n3. CHANNELS\n[ ] Customer email      [ ] In-app\n[ ] Blog / website      [ ] Changelog\n[ ] LinkedIn / X        [ ] Product Hunt / communities\n[ ] Partners            [ ] Sales outreach\n\n4. ASSETS (owner / due date / status)\n[ ] Launch video (16:9, 1:1, 9:16)\n[ ] Landing or feature page\n[ ] Screenshots / GIFs\n[ ] Announcement email\n[ ] Blog post\n[ ] Social posts\n[ ] Release notes + help docs\n[ ] Sales one-pager + demo\n[ ] Support FAQ\n\n5. TIMELINE\n6-4 weeks: brief, messaging, metrics, channels\n2 weeks: all asset drafts\nLaunch week: reviews, scheduling, QA, rota\nLaunch day: ship, publish, send, respond\nAfter: follow-up, repurpose, measure, retro\n\n6. LAUNCH DAY ROTA\nTime / person / channel to monitor\n\n7. RESULTS AND LEARNINGS\n",
    },
    {
      type: "h2",
      text: "What are the most common SaaS launch mistakes?",
      id: "common-launch-mistakes",
    },
    {
      type: "ul",
      items: [
        "**Launching everything as Tier 1.** Your audience learns to ignore announcements. Save the big push for releases that deserve it.",
        "**Starting assets the week before.** Rushed launches skip the video, the docs or the sales briefing.",
        "**No single owner.** Shared ownership means gaps nobody notices until launch day.",
        "**Forgetting existing customers.** They are often the people most likely to use the new feature and spread the word.",
        "**Treating launch day as the finish line.** Most of the value comes from follow-up and repurposing in the weeks after.",
      ],
    },
  ],
  faq: [
    {
      q: "How far in advance should you plan a SaaS product launch?",
      a: "For a major launch, start around six weeks out so there is time to settle positioning and produce assets. Minor launches usually need two to three weeks. Small improvements can go out with a changelog entry and release notes.",
    },
    {
      q: "What should be on a product launch checklist?",
      a: "A launch brief, owners for each workstream, success metrics, chosen channels, assets (launch video, landing page, email, blog post, social posts, docs, sales materials), a launch-day rota, and a post-launch plan for follow-up, repurposing and measurement.",
    },
    {
      q: "What is the difference between a product launch strategy and a launch plan?",
      a: "The strategy decides who the launch is for, what you want them to do, which channels reach them and how big the launch should be. The plan turns that into owners, assets, dates and a checklist.",
    },
    {
      q: "Do you need a video for a product launch?",
      a: "It is not mandatory, but a launch video is one of the most reusable assets you can make: it works on the landing page, in social posts, in email, on Product Hunt and in sales follow-ups.",
    },
    {
      q: "Should every release be launched on Product Hunt?",
      a: "No. Community launches work best for major releases that give people something genuinely new to try. Smaller updates are better served by your changelog, email and social channels.",
    },
  ],
};

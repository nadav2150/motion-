import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "how-to-launch-on-product-hunt",
  title: "How to Launch on Product Hunt: A Step-by-Step Guide (with Launch Video Tips)",
  metaTitle: "Product Hunt Launch Guide: How to Launch Step by Step",
  description:
    "A step-by-step Product Hunt launch guide: preparing the listing, gallery and video, timing, asking for support the right way, launch-day routine and follow-up.",
  excerpt:
    "Everything to prepare for a Product Hunt launch, from tagline and gallery to the first comment, plus how to run launch day and follow up afterwards.",
  publishAt: "2026-10-01T06:06:00Z",
  readingMinutes: 9,
  keyword: "product hunt launch",
  blocks: [
    {
      type: "p",
      text: "A Product Hunt launch can put your product in front of an audience of early adopters, makers and investors in a single day. It can also come and go without anyone noticing. The difference is almost entirely preparation: a clear listing, a gallery that explains the product at a glance, a community you have told in advance, and a team ready to answer every comment.",
    },
    {
      type: "p",
      text: "This guide walks through how to launch on Product Hunt step by step: preparing the listing, choosing the day, building support the right way, running launch day and following up. Product Hunt updates its rules and features over time, so treat its official [launch guide](https://www.producthunt.com/launch) as the source of truth and use this as a practical companion.",
    },
    {
      type: "h2",
      text: "How does a Product Hunt launch work?",
      id: "how-product-hunt-works",
    },
    {
      type: "p",
      text: "Products are submitted (hunted) by community members, often the makers themselves. Each day's launches appear on the homepage, where the community can upvote, comment and share them, and the top products are recognised as Product of the Day. According to Product Hunt's [help article on launching](https://help.producthunt.com/en/articles/479557-how-to-launch-on-product-hunt), the site runs on 24-hour periods in Pacific time, and scheduled launches go live at 12:01 AM Pacific.",
    },
    {
      type: "p",
      text: "You do not need a famous hunter. Product Hunt's own guide says there is no discernible advantage to using a third-party hunter, so most makers submit their own product. You also need a personal account: the guide states that company accounts are not allowed.",
    },
    {
      type: "h2",
      text: "Is a Product Hunt launch right for your product?",
      id: "is-product-hunt-right-for-you",
    },
    {
      type: "p",
      text: "Product Hunt works best when people can try something new quickly: a free plan, a trial, or a public demo. It suits tools for makers, developers, designers, marketers and early-stage teams. It is a weaker fit for products that require a sales call before anyone can see them, or that serve a niche the Product Hunt community does not represent.",
    },
    {
      type: "p",
      text: "Also think about timing in your own roadmap. A launch is most useful when you have something genuinely new to show: a first public release, a major new version, or a meaningful new product. It is one channel in a bigger plan, so pair it with the rest of your [SaaS product launch checklist](/blog/saas-product-launch-checklist).",
    },
    {
      type: "h2",
      text: "Product Hunt launch checklist: preparing the listing",
      id: "preparing-the-listing",
    },
    {
      type: "p",
      text: "Prepare every part of the listing a week or more ahead. Product Hunt lets you save a draft or schedule a launch for a future date, which gives you time to review it with fresh eyes.",
    },
    {
      type: "h3",
      text: "Name and tagline",
    },
    {
      type: "p",
      text: "Use your product name as people will search for it. The tagline should say what the product does, for whom, in plain words. Clever wordplay loses to clarity when someone is scrolling past dozens of launches. A useful test: could a stranger guess what the product does from the tagline alone?",
    },
    {
      type: "h3",
      text: "Description",
    },
    {
      type: "p",
      text: "Lead with the problem and the outcome, then the two or three things that make your product different. Mention pricing honestly, including what is free. Skip the buzzwords; the audience has seen all of them.",
    },
    {
      type: "h3",
      text: "Thumbnail and gallery",
    },
    {
      type: "p",
      text: "The thumbnail is what people see in the feed, so it should be recognisable at small sizes. Product Hunt's [preparation guide](https://www.producthunt.com/launch/preparing-for-launch) notes that animated GIF thumbnails animate on hover rather than autoplaying, so the first frame needs to work on its own, and it recommends avoiding strobing effects, quick cuts and unreadable text.",
    },
    {
      type: "p",
      text: "Treat the gallery as a visual pitch, not a screenshot dump. A sequence that works well:",
    },
    {
      type: "ol",
      items: [
        "**What it is.** One image with the product and the tagline-level promise.",
        "**The core workflow.** The key screen, cropped and annotated so the important part is readable.",
        "**The result.** What the user gets at the end.",
        "**Differentiators.** One image per standout feature, each with a short headline.",
        "**Social proof or pricing,** if you have something real and permissioned to show.",
      ],
    },
    {
      type: "h3",
      text: "Launch video",
    },
    {
      type: "p",
      text: "A video is optional, but it is the fastest way for a visitor to understand the product without clicking through. At the time of writing, Product Hunt's guide says videos are added as YouTube links, so upload yours to YouTube and make sure it is not set to private. More on what makes a good launch video below.",
    },
    {
      type: "h3",
      text: "First comment",
    },
    {
      type: "p",
      text: "The maker's first comment is where you tell the story. Product Hunt's guide treats it as an important part of the launch. A strong first comment covers:",
    },
    {
      type: "ul",
      items: [
        "Who you are and why you built this.",
        "The problem, in one or two sentences.",
        "What the product does and what is new if this is a relaunch.",
        "Any launch offer for the community.",
        "A specific question asking for feedback, not upvotes.",
      ],
    },
    {
      type: "h3",
      text: "Maker profiles",
    },
    {
      type: "p",
      text: "Add every team member as a maker, with a real photo and a short bio. Visitors click through to see who is behind a product, and makers who are active members of the community before launch day tend to get a warmer reception than accounts created the week before.",
    },
    {
      type: "h2",
      text: "What should a Product Hunt launch video include?",
      id: "product-hunt-launch-video",
    },
    {
      type: "p",
      text: "Visitors arrive from the homepage with a few seconds of curiosity. The video should earn their attention immediately and make sense without sound.",
    },
    {
      type: "ul",
      items: [
        "**Show the outcome in the first few seconds.** Skip logo intros.",
        "**Keep it short.** Around 30 to 90 seconds is enough to show one workflow from problem to payoff.",
        "**Zoom into the UI.** Full-screen captures are unreadable in an embedded player. Push in on the part that matters.",
        "**Use captions or on-screen text.** Many people watch on mute.",
        "**Match the gallery.** Same colours, same story, so the listing feels like one piece.",
        "**End with one clear next step,** such as trying the free plan.",
      ],
    },
    {
      type: "p",
      text: "Make a vertical or square cut at the same time. You will want it for X, LinkedIn and other channels on launch day. Our [motion graphics examples](/blog/motion-graphics-examples) cover the techniques that make product UI look good on video.",
    },
    {
      type: "cta",
      title: "Make your Product Hunt video from screenshots",
      text: "Videly turns screenshots or your product URL plus a short script into a motion-designed launch video with captions, in 16:9, 1:1 and 9:16. Approve the storyboard before it renders.",
      href: "/launch-videos",
      label: "Create a launch video",
    },
    {
      type: "h2",
      text: "When is the best time to launch on Product Hunt?",
      id: "best-time-to-launch",
    },
    {
      type: "p",
      text: "Because the day runs on Pacific time, launching right at the start of that day (12:01 AM Pacific) gives your product the full 24 hours on the homepage. Product Hunt's preparation guide suggests this as a rule of thumb for makers without other constraints. It also notes there can be reasons to launch later, for example if your team is in a different time zone and wants to be awake to respond.",
    },
    {
      type: "p",
      text: "On day of the week, there is a trade-off that makers debate endlessly: busier weekdays mean more visitors but more competition, while quieter days mean less of both. Pick a day when your whole team can be online, and avoid clashing with major holidays or your own big releases. Being present matters more than picking a perfect slot.",
    },
    {
      type: "h2",
      text: "How do you get support without asking for upvotes?",
      id: "getting-support-without-asking-for-upvotes",
    },
    {
      type: "p",
      text: "Product Hunt's guidelines discourage asking people directly for upvotes; its [launch guide](https://www.producthunt.com/launch) is explicit that this is the one real rule when promoting your launch. Paid votes, upvote exchanges and mass messages asking for upvotes go against the spirit of the platform and can backfire. The good news is that the approach that works best is also the allowed one: ask for feedback and attention, not votes.",
    },
    {
      type: "ul",
      items: [
        "**Tell your audience in advance.** Let your newsletter, customers and social followers know the date and that you would love their feedback.",
        "**On the day, share the link with a feedback ask.** For example: We just launched on Product Hunt and would love your honest thoughts in the comments.",
        "**Personal messages to people who know the product.** Customers, beta users and friends who have actually used it can leave genuine, specific comments.",
        "**Be active in the community before you launch.** Comment on other launches and help other makers in the weeks before yours.",
        "**Avoid shortcuts.** Do not buy votes, join upvote exchanges or ask people to create new accounts just to support you.",
      ],
    },
    {
      type: "h2",
      text: "Product Hunt launch guide: the launch-day routine",
      id: "launch-day-routine",
    },
    {
      type: "ol",
      items: [
        "**Just after the launch goes live:** check the listing renders correctly, links work and the first comment is posted.",
        "**Early morning:** share the launch link on your own channels with a feedback ask, and email your list.",
        "**Throughout the day:** reply to every comment thoughtfully and quickly. Answer criticism openly; it is often the most useful feedback you will get.",
        "**Set shifts:** split the day across team members and time zones so someone is always responding.",
        "**Mid-day:** post an update on social with something new, such as a short clip of a feature people asked about in the comments.",
        "**Watch your product, not just the leaderboard:** monitor sign-ups, errors and support tickets. A broken onboarding flow costs more than a lower ranking.",
        "**End of day:** thank everyone publicly, and note the questions and objections that came up.",
      ],
    },
    {
      type: "h2",
      text: "What should you do after a Product Hunt launch?",
      id: "after-the-launch",
    },
    {
      type: "ul",
      items: [
        "**Follow up with new users.** A welcome email that asks what brought them is a cheap source of positioning insight.",
        "**Act on the feedback.** Fix the top issues and reply in the original comment threads to say what changed.",
        "**Reuse the assets.** The video, gallery images and first comment can become a landing page section, social posts and a blog post.",
        "**Add the badge if you earned one.** If you placed well, Product Hunt badges can go on your site as social proof.",
        "**Write down what you learned.** Timing, messaging and which channels drove visitors will make your next launch easier.",
        "**Plan the next one.** Product Hunt's [post-launch guide](https://www.producthunt.com/launch/two-weeks-post-launch) notes you can launch again after you have updated your product, so keep a list of candidate releases.",
      ],
    },
    {
      type: "h2",
      text: "Product Hunt launch checklist (summary)",
      id: "product-hunt-launch-checklist",
    },
    {
      type: "template",
      title: "Product Hunt launch checklist",
      text: "PRODUCT HUNT LAUNCH CHECKLIST\n\nTWO OR MORE WEEKS BEFORE\n[ ] Read Product Hunt's official launch guide\n[ ] Personal maker accounts set up, profiles complete\n[ ] Team active in the community (comments, feedback on other launches)\n[ ] Launch date chosen, team availability confirmed\n\nONE WEEK BEFORE\n[ ] Name and tagline final\n[ ] Description final, pricing stated clearly\n[ ] Thumbnail works at small size (first frame if GIF)\n[ ] Gallery images in story order\n[ ] Launch video on YouTube, not private, captions on\n[ ] Vertical / square video cut for social\n[ ] First comment drafted\n[ ] Launch offer ready (optional)\n[ ] Draft saved or launch scheduled\n[ ] Supporters told the date (ask for feedback, not upvotes)\n\nLAUNCH DAY\n[ ] Listing live, links tested, first comment posted\n[ ] Share on social, email list, communities you belong to\n[ ] Reply to every comment\n[ ] Response shifts covered across time zones\n[ ] Monitor sign-ups, errors, support\n[ ] Thank-you post at end of day\n\nAFTER\n[ ] Welcome and follow up with new users\n[ ] Fix top issues, reply in threads\n[ ] Repurpose video and gallery\n[ ] Add badge if earned\n[ ] Write up learnings\n",
    },
  ],
  faq: [
    {
      q: "What time does a Product Hunt launch start?",
      a: "Product Hunt runs on 24-hour days in Pacific time, and scheduled launches go live at 12:01 AM Pacific. Launching at the start of the day gives your product the full day on the homepage.",
    },
    {
      q: "Do I need a hunter to launch on Product Hunt?",
      a: "No. Product Hunt's own launch guide says there is no discernible advantage to using a third-party hunter, so most makers submit their own product.",
    },
    {
      q: "Can I ask people to upvote my Product Hunt launch?",
      a: "Product Hunt's guidelines discourage asking people directly for upvotes. Share your launch link and ask for feedback and comments instead.",
    },
    {
      q: "Do I need a video for a Product Hunt launch?",
      a: "A video is optional, but it helps visitors understand the product quickly. Keep it short, show the outcome early, zoom into the UI and add captions. Check Product Hunt's current guide for how videos are added to the gallery.",
    },
    {
      q: "Can you launch on Product Hunt more than once?",
      a: "Yes. Product Hunt's launch guide says you can launch again after you have updated your product. Check its current guidelines for the rules that apply before scheduling a relaunch.",
    },
  ],
};

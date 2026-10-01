import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "release-notes-template",
  title: "Release Notes Template (Free) + 10 Great Release Notes Examples",
  metaTitle: "Release Notes Template (Free) + 10 Real Examples",
  description:
    "A free, copy-paste release notes template for SaaS teams, a step-by-step guide to writing release notes, and 10 real release notes examples worth studying.",
  excerpt:
    "Two copy-paste release notes templates, a simple process for writing them, and 10 real release notes examples from teams like Slack, Stripe and Linear.",
  publishAt: "2026-10-01T06:00:00Z",
  readingMinutes: 9,
  keyword: "release notes template",
  blocks: [
    {
      type: "p",
      text: "A good **release notes template** saves you from staring at a blank page every time you ship. This guide gives you two free templates you can copy today (a short customer-facing one and a fuller versioned one), a step-by-step process for writing release notes, and 10 real release notes examples from SaaS and software teams, with what each one does well.",
    },
    {
      type: "p",
      text: "Release notes are the record of what changed in a specific release and why it matters to the reader. They are not a commit log. The commit log is for engineers; release notes are for the people who use, buy or support your product.",
    },
    { type: "h2", text: "What should release notes include?", id: "what-to-include" },
    {
      type: "p",
      text: "Most useful release notes answer the same five questions, in roughly this order:",
    },
    {
      type: "ol",
      items: [
        "**What is this release?** A version number, a date, or both, so people can tell which build they are on.",
        "**What is new?** New features and capabilities, described by what the user can now do.",
        "**What got better?** Improvements to existing features: speed, usability, new options.",
        "**What got fixed?** Bugs that customers may have noticed, described by the symptom they saw.",
        "**What do I need to do?** Breaking changes, deprecations, required migrations or settings to turn on.",
      ],
    },
    {
      type: "p",
      text: "Optional extras that help: a screenshot or short clip for the headline change, a link to the docs, and who to contact if something breaks. Leave out internal ticket numbers, refactors nobody can see, and anything that only makes sense inside your team.",
    },
    { type: "h2", text: "Release notes template (short, customer-facing)", id: "short-release-notes-template" },
    {
      type: "p",
      text: "Use this for a single feature or a small batch of changes. It works in an in-app 'What's new' panel, a changelog page, an email or a Slack community post. Replace everything in square brackets.",
    },
    {
      type: "template",
      title: "Short release note",
      text: "[Feature name]: [one-line benefit]\n[Date]\n\nYou can now [do the new thing] directly from [where in the product].\nBefore, [the old, slower or missing way]. Now, [the new way in one sentence].\n\nHow to try it:\n1. Go to [screen or menu].\n2. Click [button or setting].\n3. [What happens next.]\n\nAlso in this update:\n- Improved: [improvement, described as a user outcome]\n- Fixed: [bug, described by the symptom users saw]\n\nAvailable on: [all plans / Pro and above / rolling out over the next few days]\nLearn more: [link to docs]",
    },
    {
      type: "p",
      text: "Two things make this template work. The headline names the benefit, not just the feature. And the 'How to try it' steps turn a passive announcement into something the reader can act on in under a minute.",
    },
    { type: "h2", text: "Release notes template (full, versioned)", id: "versioned-release-notes-template" },
    {
      type: "p",
      text: "Use this when you ship numbered releases: desktop or mobile apps, APIs, SDKs, self-hosted software, or a monthly roll-up for a web app. It is the format most software release notes examples follow.",
    },
    {
      type: "template",
      title: "Versioned release notes",
      text: "[Product name] [version number]\nReleased [date]\n\nHighlights\n[Two or three sentences on the most important change and who it is for.]\n\nNew\n- [Feature]: [what users can now do]. [Link to docs]\n- [Feature]: [what users can now do].\n\nImproved\n- [Area]: [what is better and how users will notice].\n- [Area]: [what is better and how users will notice].\n\nFixed\n- [Symptom users saw] when [situation]. ([platform, if relevant])\n- [Symptom users saw] when [situation].\n\nBreaking changes and deprecations\n- [What changed], which affects [who]. To keep things working, [action] before [date].\n- [Feature or endpoint] is deprecated and will be removed on [date]. Use [replacement] instead.\n\nKnown issues\n- [Issue] - workaround: [workaround].\n\nUpgrade\n[How to update, or note that web users get it automatically.]\n\nQuestions? [Support link or contact]",
    },
    {
      type: "p",
      text: "Delete any section that is empty for a given release. An empty 'Known issues' heading reads like you forgot to fill it in.",
    },
    { type: "h2", text: "How to write release notes, step by step", id: "how-to-write-release-notes" },
    {
      type: "p",
      text: "Templates handle structure. The quality comes from the writing. Here is a process that keeps release notes accurate and readable without turning them into a big project.",
    },
    { type: "h3", text: "1. Collect changes as you ship, not at the end" },
    {
      type: "p",
      text: "Ask whoever merges a user-facing change to add a one-line, plain-English note to the pull request or ticket. A label like 'release-note' makes these easy to pull together later. Writing from memory a month later is how fixes get lost and features get described wrongly.",
    },
    { type: "h3", text: "2. Sort by impact on the reader" },
    {
      type: "p",
      text: "Put the change most people will care about first, even if it was the smallest engineering effort. Then group the rest into New, Improved and Fixed. If a release has one big feature and twenty small fixes, the feature deserves its own paragraph and the fixes can be a compact list.",
    },
    { type: "h3", text: "3. Write each item as a user outcome" },
    {
      type: "p",
      text: "Swap the engineering description for what the user experiences. 'Refactored export queue' becomes 'Large exports now finish without timing out.' 'Fixed null pointer in invite flow' becomes 'Fixed an error some people saw when inviting a teammate by email.'",
    },
    { type: "h3", text: "4. Be specific and honest" },
    {
      type: "p",
      text: "Name the screen, the setting and the plan. If something is rolling out gradually, say so; people will otherwise assume it is broken. If you removed something, say what replaces it. Vague notes like 'various improvements and bug fixes' tell readers nothing and erode trust over time.",
    },
    { type: "h3", text: "5. Flag anything that requires action" },
    {
      type: "p",
      text: "Breaking changes, deprecations and required migrations should never be buried in a bullet list. Put them in their own section with a clear deadline and the exact action to take. This matters most for API and developer products.",
    },
    { type: "h3", text: "6. Add one visual for the headline change" },
    {
      type: "p",
      text: "A screenshot, GIF or short video of the main feature does more than three extra paragraphs. Keep it to the one change that benefits from being seen; not every bug fix needs an image.",
    },
    { type: "h3", text: "7. Publish where people will actually see it" },
    {
      type: "p",
      text: "The same note can live in several places: a public changelog page, an in-app announcement, a product update email, your community and social channels. Write it once in the template above, then trim it for each channel rather than writing five versions from scratch.",
    },
    { type: "h2", text: "10 release notes examples worth studying", id: "release-notes-examples" },
    {
      type: "p",
      text: "These are public release notes pages from well-known software companies, each linked so you can see the current version. Descriptions reflect the pages at the time of writing; layouts change, so look at the patterns rather than copying any one page.",
    },
    { type: "h3", text: "1. Slack desktop release notes" },
    {
      type: "p",
      text: "[Slack's Mac release notes](https://slack.com/release-notes/mac) list each version number with its date and a short 'Bug Fixes' or 'What's new' section, with separate pages for each platform. **Worth copying:** a consistent, light-hearted voice that makes even a minor update readable, and per-platform pages so people only see what applies to them.",
    },
    { type: "h3", text: "2. Visual Studio Code" },
    {
      type: "p",
      text: "[VS Code's updates page](https://code.visualstudio.com/updates) opens each versioned release with a short 'Release highlights' summary and download links, then goes deep on each area. Previous versions are one click away in a sidebar. **Worth copying:** a skimmable summary above a detailed body, so casual readers and power users are both served.",
    },
    { type: "h3", text: "3. Raycast" },
    {
      type: "p",
      text: "[Raycast's changelog](https://www.raycast.com/changelog) gives each version a date, a short narrative intro about the headline change, then clear sections for new features, improvements and fixes, each line prefixed with the area it touches. **Worth copying:** the area prefix on every bullet (for example 'AI Chat:' or 'Clipboard History:') makes long lists easy to scan.",
    },
    { type: "h3", text: "4. Notion" },
    {
      type: "p",
      text: "[Notion's What's New page](https://www.notion.com/releases) pairs a version number and date with a headline that names the main feature, then explains the problem it solves in a few friendly paragraphs. **Worth copying:** leading with the 'why' before the 'what', which suits big releases aimed at non-technical users.",
    },
    { type: "h3", text: "5. Stripe API changelog" },
    {
      type: "p",
      text: "[Stripe's changelog](https://docs.stripe.com/changelog) is organised by API version, with breaking changes clearly separated and filters by product area. **Worth copying:** if you have an API, treat breaking changes as their own category and let developers filter to what affects them.",
    },
    { type: "h3", text: "6. Intercom" },
    {
      type: "p",
      text: "[Intercom's changes page](https://www.intercom.com/changes/en) tags each entry by type and product area, then writes it as a short problem-and-solution story followed by a 'Learn more' link. **Worth copying:** opening each note with the customer problem before describing the fix.",
    },
    { type: "h3", text: "7. Figma" },
    {
      type: "p",
      text: "[Figma's release notes](https://www.figma.com/release-notes/) show dated entries tagged with the products they affect, short bullet lists of what changed, and a copy-link option on each entry. **Worth copying:** product tags, which help when one company ships several products from one page.",
    },
    { type: "h3", text: "8. GitHub Changelog" },
    {
      type: "p",
      text: "The [GitHub Changelog](https://github.blog/changelog/) labels every item as a release, an improvement or a retirement, and lets you filter by topic or subscribe via RSS. **Worth copying:** a 'Retired' label, which makes removals as visible as additions.",
    },
    { type: "h3", text: "9. Linear" },
    {
      type: "p",
      text: "[Linear's changelog](https://linear.app/changelog) leads each dated entry with a headline feature and visuals, then follows with a grouped list of smaller improvements and fixes by area. **Worth copying:** one story per release, with the long tail of small changes still documented underneath.",
    },
    { type: "h3", text: "10. Cursor" },
    {
      type: "p",
      text: "[Cursor's changelog](https://cursor.com/changelog) publishes dated entries with a clear headline and sub-headings that break a large launch into digestible parts. **Worth copying:** sub-headings inside a single note, which keep a big release readable without splitting it into several posts.",
    },
    { type: "h2", text: "Software release notes example: before and after", id: "software-release-notes-example" },
    {
      type: "p",
      text: "Here is a typical first draft and the same note rewritten with the principles above.",
    },
    {
      type: "template",
      title: "Before",
      text: "v2.14.0\n- Added CSV export\n- Perf improvements\n- Fixed bug #4821\n- Updated dependencies",
    },
    {
      type: "template",
      title: "After",
      text: "Version 2.14 - [date]\n\nExport any report to CSV\nYou can now download any report as a CSV file from the Share menu, so you can work with your data in a spreadsheet without copying it by hand. Available on all plans.\n\nImproved\n- Dashboards with many charts now load noticeably faster.\n\nFixed\n- Fixed an issue where some scheduled reports were sent twice.",
    },
    {
      type: "p",
      text: "The 'after' version drops the invisible dependency update, names where the feature lives, says who gets it, and turns a ticket number into a symptom customers will recognise.",
    },
    { type: "h2", text: "Common release notes mistakes", id: "release-notes-mistakes" },
    {
      type: "ul",
      items: [
        "**Copying the commit log.** Engineers write commits for each other; customers cannot parse them.",
        "**Burying breaking changes.** Anything that needs action belongs at the top or in its own section.",
        "**Writing for the team, not the reader.** Internal codenames and project names mean nothing outside the company.",
        "**Over-promising.** Do not announce a feature as available to everyone if it is still rolling out.",
        "**Publishing nothing at all.** Shipping silently makes the product look stagnant even when the team is busy.",
      ],
    },
    { type: "h2", text: "Turn your release note into a feature announcement video", id: "release-note-to-video" },
    {
      type: "p",
      text: "Your release notes are text, but your headline feature often lands better when people can see it. A 20 to 45 second clip showing the new feature in context works well at the top of a changelog entry, in the announcement email, and on social channels where a wall of text gets scrolled past.",
    },
    {
      type: "p",
      text: "The good news is that a well-written release note is already most of a video script: the headline is your opening line, the 'before and now' sentence is the problem and solution, and the 'How to try it' steps are your scenes. Pair it with two or three screenshots of the feature and you have everything you need for one of these [feature announcement videos](/feature-announcement-videos).",
    },
    {
      type: "cta",
      title: "Make a video for your next release",
      text: "Videly turns screenshots and a short script into a motion-designed feature video, with a storyboard to approve before it renders. Free plan, no card needed.",
      href: "/feature-announcement-videos",
      label: "Make a feature video",
    },
    {
      type: "p",
      text: "If you publish release notes publicly, the next step is a changelog page that collects them. See these [changelog examples](/blog/changelog-examples) for layouts worth borrowing.",
    },
  ],
  faq: [
    {
      q: "What is the difference between release notes and a changelog?",
      a: "Release notes describe the changes in one specific release, often with context and instructions. A changelog is the running, reverse-chronological list of all those changes over time. In practice many SaaS teams publish their release notes as entries on a public changelog page.",
    },
    {
      q: "How long should release notes be?",
      a: "As short as possible while still answering what changed, why it matters and what the reader needs to do. A single feature can be a headline plus three or four sentences. A versioned release with many changes can be longer, but should open with a short highlights summary.",
    },
    {
      q: "Who should write release notes?",
      a: "Usually a product manager or product marketer owns them, with engineers supplying a one-line note for each user-facing change as they ship. Having one owner keeps the voice consistent; collecting notes during development keeps them accurate.",
    },
    {
      q: "Should release notes include bug fixes?",
      a: "Include fixes that customers could have noticed, described by the symptom they saw. Skip purely internal fixes and refactors. Listing visible fixes shows that reported problems are being handled.",
    },
    {
      q: "Where should I publish release notes?",
      a: "A public changelog page is the usual home, so there is one permanent record. From there, share the important ones in-app, by email to active users, and on social or community channels, trimming the text for each.",
    },
  ],
};

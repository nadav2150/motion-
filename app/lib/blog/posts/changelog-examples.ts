import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "changelog-examples",
  title: "Changelog Examples: 12 SaaS Changelogs Worth Copying",
  metaTitle: "Changelog Examples: 12 SaaS Changelogs Worth Copying",
  description:
    "12 real SaaS changelog examples from Linear, Stripe, GitHub, Vercel and more, the patterns that make them work, and a free changelog entry template to copy.",
  excerpt:
    "What makes a public changelog worth reading, 12 real SaaS changelog examples with the pattern each one does well, and a changelog entry template you can copy.",
  publishAt: "2026-10-05T06:00:00Z",
  readingMinutes: 8,
  keyword: "changelog examples",
  blocks: [
    {
      type: "p",
      text: "Looking at good **changelog examples** is the fastest way to design your own. This post walks through 12 public SaaS changelogs, the specific pattern each one gets right, and the decisions you need to make before you publish your first entry. At the end there is a changelog entry template you can paste into whatever tool you use.",
    },
    {
      type: "p",
      text: "A public changelog is a running, dated list of what changed in your product. Done well, it shows customers and prospects that the product is alive, gives support and sales a link to share, and becomes a searchable record of every feature you have shipped.",
    },
    { type: "h2", text: "What makes a good changelog?", id: "what-makes-a-good-changelog" },
    {
      type: "p",
      text: "The best changelogs look different from each other, but they share a few traits:",
    },
    {
      type: "ul",
      items: [
        "**Dated, newest first.** Readers should see at a glance when something shipped and whether the product is actively developed.",
        "**Written for users.** Each entry explains what someone can now do, not which service was refactored.",
        "**Scannable.** A clear title per entry, short paragraphs, and consistent labels like New, Improved and Fixed.",
        "**Visual where it helps.** A screenshot, GIF or short video for features people need to see to understand.",
        "**Linked.** Each entry points to docs or the feature itself, so curious readers can go deeper or try it.",
        "**Subscribable.** RSS, email or a social account, so people can follow updates without remembering to visit.",
        "**Permanent.** Each entry has its own link, which makes it easy to share in support replies and sales emails.",
      ],
    },
    {
      type: "p",
      text: "If you already write release notes, your changelog is where they live in public. Our [release notes template](/blog/release-notes-template) covers how to write each individual note.",
    },
    { type: "h2", text: "12 SaaS changelog examples", id: "saas-changelog-examples" },
    {
      type: "p",
      text: "Every example below links to the live page. Descriptions reflect each page at the time of writing; layouts change, so focus on the pattern rather than the pixels.",
    },
    { type: "h3", text: "1. Linear: one story per entry" },
    {
      type: "p",
      text: "[Linear's changelog](https://linear.app/changelog) leads each dated entry with one headline feature, explained in a few paragraphs with visuals, followed by grouped lists of smaller improvements and fixes by product area. The changelog sits alongside separate streams for product launches and team posts. **Pattern:** a strong headline feature on top, the long tail of small changes documented underneath.",
    },
    { type: "h3", text: "2. Vercel: short, filterable posts" },
    {
      type: "p",
      text: "[Vercel's changelog](https://vercel.com/changelog) shows each change as a dated card with a title, a one or two sentence summary and the names of the people who worked on it, with search and category filters. **Pattern:** many small, focused entries instead of one big monthly round-up, which suits products that ship continuously.",
    },
    { type: "h3", text: "3. Stripe: built around API versions" },
    {
      type: "p",
      text: "[Stripe's changelog](https://docs.stripe.com/changelog) is organised by named API version, separates breaking changes from additive ones, and lets you filter by product area or availability. Signed-in users can narrow it to changes relevant to the APIs they use. **Pattern:** for developer products, make breaking changes impossible to miss and let readers filter to what affects them.",
    },
    { type: "h3", text: "4. GitHub: labels for every type of change" },
    {
      type: "p",
      text: "The [GitHub Changelog](https://github.blog/changelog/) labels every entry as a release, an improvement or a retirement, adds topic tags, and offers RSS and a dedicated social account. **Pattern:** a 'Retired' label that makes removals and deprecations as visible as new features.",
    },
    { type: "h3", text: "5. Supabase: tagged entries with a copy-as-Markdown option" },
    {
      type: "p",
      text: "[Supabase's changelog](https://supabase.com/changelog) lists dated entries with a type tag such as 'New Feature', detailed technical write-ups with code where relevant, an RSS feed and an option to copy the page as Markdown. **Pattern:** making the changelog easy to consume by machines and AI tools as well as people.",
    },
    { type: "h3", text: "6. PostHog: grouped by month, owned by teams" },
    {
      type: "p",
      text: "[PostHog's changelog](https://posthog.com/changelog) groups entries by month, and each entry shows the date, the team that shipped it, the product area and a 'Read the docs' link. It is also available as RSS and Markdown. **Pattern:** showing which team owns each change, which works well for multi-product companies.",
    },
    { type: "h3", text: "7. Raycast: versioned notes per platform" },
    {
      type: "p",
      text: "[Raycast's changelog](https://www.raycast.com/changelog) has tabs for each platform, then gives every version a date, a short intro to the main change, and sections for new features, improvements and fixes, each bullet prefixed with the feature it touches. **Pattern:** a classic versioned format that still feels friendly because of the narrative intro.",
    },
    { type: "h3", text: "8. Resend: the minimal list" },
    {
      type: "p",
      text: "[Resend's changelog](https://resend.com/changelog) is a clean list: date, title, one-sentence summary and author, with search and a subscribe button. Each title links to a fuller post. **Pattern:** the easiest format to maintain, because each entry only needs a title and one sentence to go live.",
    },
    { type: "h3", text: "9. Sentry: product features and SDK releases together" },
    {
      type: "p",
      text: "[Sentry's changelog](https://sentry.io/changelog/) mixes product announcements with SDK release entries, each with a title, a one-line summary, a date and a link to read more. **Pattern:** one destination for everything a developer customer might need to know, from new features to library versions.",
    },
    { type: "h3", text: "10. Intercom: problem first, then the fix" },
    {
      type: "p",
      text: "[Intercom's changes page](https://www.intercom.com/changes/en) tags each entry by type and product area, credits the teammate who shared it, and usually opens with the customer problem before describing what changed and linking to more detail. **Pattern:** problem-then-solution writing, which explains why a change matters to people who did not request it.",
    },
    { type: "h3", text: "11. Cursor: long-form launches inside the changelog" },
    {
      type: "p",
      text: "[Cursor's changelog](https://cursor.com/changelog) gives big releases full write-ups with sub-headings, so a major launch can be explained in depth without leaving the changelog. **Pattern:** the changelog doubles as the launch post for significant features.",
    },
    { type: "h3", text: "12. Figma: one changelog for many products" },
    {
      type: "p",
      text: "[Figma's release notes](https://www.figma.com/release-notes/) tag each dated entry with the products it affects, use short bullet lists, and give every entry a copy-link button. **Pattern:** product tags that keep a single changelog usable when a company ships several products.",
    },
    { type: "h2", text: "Changelog patterns: which format should you use?", id: "changelog-patterns" },
    {
      type: "p",
      text: "Across these examples, most public changelogs fall into one of four formats. Pick the one that matches how you ship and how much time you can give it.",
    },
    {
      type: "table",
      head: ["Format", "Best for", "Effort per entry", "Seen in"],
      rows: [
        ["Minimal list (title + one line)", "Teams shipping small changes often", "Low", "Resend, Vercel"],
        ["Headline feature + grouped fixes", "Regular releases with one main story", "Medium", "Linear"],
        ["Versioned notes (New / Improved / Fixed)", "Desktop, mobile and versioned apps", "Medium", "Raycast"],
        ["API-version changelog", "Developer platforms with breaking changes", "High", "Stripe"],
      ],
    },
    {
      type: "p",
      text: "Whatever format you choose, be consistent. A changelog that switches style every entry is harder to scan than one that is simply plain.",
    },
    { type: "h2", text: "Changelog entry template", id: "changelog-entry-template" },
    {
      type: "p",
      text: "This template covers a single entry in the headline-plus-details format, which suits most SaaS products. For a minimal list, use only the first two lines.",
    },
    {
      type: "template",
      title: "Changelog entry",
      text: "[Date]  [Label: New / Improved / Fixed / Deprecated]\n\n[Title: what users can now do]\n[One sentence summary that works on its own in a list view.]\n\n[Short paragraph: the problem this solves and who it is for.]\n[Short paragraph: how it works, where to find it, which plans get it.]\n\n[Screenshot, GIF or short video of the feature]\n\nAlso shipped\n- Improved: [area] - [what is better]\n- Fixed: [symptom users saw] when [situation]\n\n[Link: Read the docs] [Link: Try it now]",
    },
    {
      type: "p",
      text: "Write the one-sentence summary first. If you cannot explain the change in a sentence, the entry is not ready, and that sentence will be reused in your email, in-app announcement and social posts anyway.",
    },
    { type: "h2", text: "How to set up a public changelog", id: "how-to-set-up-a-changelog" },
    {
      type: "ol",
      items: [
        "**Choose where it lives.** A /changelog page on your own domain keeps the links and search traffic with you. A dedicated changelog tool or a docs platform works too; the point is one permanent URL.",
        "**Decide your labels.** New, Improved, Fixed and Deprecated cover almost everything. Add product-area tags only if you have several products.",
        "**Set a rhythm you can keep.** Shipping entries as features land is ideal; a weekly or monthly round-up is fine. An abandoned changelog with a last entry from long ago looks worse than none.",
        "**Make collecting changes part of shipping.** Ask for a one-line user-facing note on every pull request or ticket that changes the product.",
        "**Add a way to follow it.** RSS is cheap to offer. An email digest or social post for bigger entries reaches people who will never visit the page.",
        "**Link to it everywhere.** Footer, help centre, in-app 'What's new' menu, and support macros.",
      ],
    },
    { type: "h2", text: "Changelog mistakes to avoid", id: "changelog-mistakes" },
    {
      type: "ul",
      items: [
        "**Dumping git history.** Commit messages are not changelog entries.",
        "**Only posting big launches.** Small fixes show momentum and prove reported bugs get handled.",
        "**No dates.** Without dates, readers cannot tell if the product is still being worked on.",
        "**Hiding removals.** If you remove or change something people rely on, say so clearly and early.",
        "**Walls of text.** Long entries need headings, short paragraphs and one good visual.",
      ],
    },
    { type: "h2", text: "Add video to your changelog entries", id: "changelog-video" },
    {
      type: "p",
      text: "Several of the changelogs above use images or clips for their headline features, because some changes only make sense when you see them move. A short video at the top of an entry also gives you something to post on social channels, where a link to a text page rarely gets much attention.",
    },
    {
      type: "p",
      text: "You do not need a video for every fix. Save it for the one feature per release that you want people to try, and keep it short. Screenshots of the new feature plus the one-sentence summary from your entry are enough raw material for [feature announcement videos](/feature-announcement-videos) that match the rest of your launch.",
    },
    {
      type: "cta",
      title: "Turn your next changelog entry into a video",
      text: "Upload screenshots, paste your entry summary as the script, approve the storyboard and export in 16:9, 1:1 or 9:16. Free plan available.",
      href: "/feature-announcement-videos",
      label: "Make a feature video",
    },
  ],
  faq: [
    {
      q: "What is a changelog?",
      a: "A changelog is a dated, newest-first record of changes to a product. For SaaS companies it is usually a public web page listing new features, improvements, fixes and deprecations, often with a link to more detail for each.",
    },
    {
      q: "What is the difference between a changelog and release notes?",
      a: "Release notes describe what changed in a single release. A changelog collects those changes over time in one place. Many SaaS teams write release notes and publish them as entries on their changelog.",
    },
    {
      q: "How often should you update a changelog?",
      a: "Whenever you ship something users would notice, or in a regular round-up if you prefer batching. Consistency matters more than frequency: a steady rhythm signals an active product, while a long gap can make it look abandoned.",
    },
    {
      q: "Should a changelog be public?",
      a: "For most SaaS products, yes. A public changelog helps customers discover features, gives support and sales a page to link to, and shows prospects the product is actively developed. Keep security-sensitive or customer-specific details out of it.",
    },
    {
      q: "What should a changelog entry include?",
      a: "At minimum a date, a clear title and a one-sentence summary. Better entries add a label such as New or Fixed, a short explanation of who it is for, a visual for features, and a link to docs or the feature itself.",
    },
  ],
};

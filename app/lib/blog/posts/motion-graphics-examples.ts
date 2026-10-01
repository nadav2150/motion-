import type { BlogPost } from "../types";

export const post: BlogPost = {
  slug: "motion-graphics-examples",
  title: "Motion Graphics Examples for SaaS: Techniques That Make a UI Feel Alive",
  metaTitle: "Motion Graphics Examples for SaaS: 9 UI Techniques",
  description:
    "Motion graphics examples for SaaS videos, organised by technique: zooms, focus pulls, parallax, kinetic type, UI build-ons, cursor moves, transitions and more.",
  excerpt:
    "Nine motion graphics techniques that make product UI feel alive in launch videos and demos, with when to use each, how to do it well, and the mistakes to avoid.",
  publishAt: "2026-10-15T06:00:00Z",
  readingMinutes: 9,
  keyword: "motion graphics examples",
  blocks: [
    {
      type: "p",
      text: "Search for motion graphics examples and you get showreels: liquid shapes, 3D logos, music-video typography. Beautiful, but not much help if your job is to make a SaaS dashboard look good in a 45-second launch video. Product motion design is its own craft. The goal is not spectacle; it is to make a static interface feel alive and to guide the viewer's eye to the one thing that matters on each screen.",
    },
    {
      type: "p",
      text: "This guide is organised by technique rather than by showreel. For each one: what it is, when to use it, how to do it well, and the mistakes that make it look cheap. Combine three or four of these and you have the visual language of most good SaaS launch videos.",
    },
    {
      type: "h2",
      text: "What do the best SaaS motion graphics examples have in common?",
      id: "what-makes-good-saas-motion-graphics",
    },
    {
      type: "p",
      text: "If you study the marketing sites of design-led software companies, such as [Stripe](https://stripe.com), [Linear](https://linear.app) and [Vercel](https://vercel.com), or the scroll-driven product pages Apple builds for launches like its [iPhone line](https://www.apple.com/iphone/), a few principles show up again and again. Motion is used to explain rather than decorate. The interface itself is the hero, often simplified or stylised. And movement is restrained: smooth easing, few simultaneous changes, plenty of stillness between moves.",
    },
    {
      type: "p",
      text: "Keep three rules in mind as you read the techniques below:",
    },
    {
      type: "ul",
      items: [
        "**One focal point at a time.** If two things move at once, the viewer watches neither.",
        "**Motion should carry meaning.** Every move should answer a question: where did this come from, what changed, what should I look at?",
        "**Easing beats speed.** Linear movement looks mechanical. Ease-in-out curves with a gentle settle make even simple moves feel designed.",
      ],
    },
    {
      type: "h2",
      text: "1. Zoom into detail: how do you show small UI clearly?",
      id: "zoom-into-detail",
    },
    {
      type: "p",
      text: "**What it is.** The camera starts on the full screen for context, then pushes in on a specific element: a chart value, a new button, a generated result.",
    },
    {
      type: "p",
      text: "**When to use it.** Almost always. Full-screen UI shrunk into a video player is unreadable, especially on phones. Zooms are the single most useful technique in product video because they solve legibility and direct attention at the same time.",
    },
    {
      type: "p",
      text: "**How to do it well.** Show the wide shot long enough to orient the viewer (around a second is often enough), then zoom with a smooth ease. Capture screenshots at high resolution so the zoomed state stays sharp. Hold on the detail long enough to read it.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Zooming on every single beat until the viewer feels seasick, zooming into blurry upscaled pixels, and cutting away before the text can be read.",
    },
    {
      type: "h2",
      text: "2. Focus pull and blur: how do you direct attention?",
      id: "focus-pull-and-blur",
    },
    {
      type: "p",
      text: "**What it is.** Everything except the focal element is blurred, dimmed or desaturated, the way a camera's depth of field isolates a subject.",
    },
    {
      type: "p",
      text: "**When to use it.** When the element you want to highlight sits inside a busy screen and zooming would lose important context, such as a single row in a table or a notification in a full dashboard.",
    },
    {
      type: "p",
      text: "**How to do it well.** Keep the blur subtle enough that the surroundings are still recognisable as your product. Pair it with a gentle scale-up of the focused element so it lifts off the page. Release the focus before moving to the next beat.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Heavy blur that makes the product look like a stock background, and spotlighting something the script never mentions.",
    },
    {
      type: "h2",
      text: "3. Parallax layers: how do you add depth to flat screenshots?",
      id: "parallax-layers",
    },
    {
      type: "p",
      text: "**What it is.** The UI is split into layers (background, main window, floating cards, cursor) that move at slightly different speeds or angles, creating a sense of depth.",
    },
    {
      type: "p",
      text: "**When to use it.** Hero shots, openers and any moment where you want the product to feel premium. A tilted, layered view of your app is a staple of launch videos for a reason.",
    },
    {
      type: "p",
      text: "**How to do it well.** Separate the UI into a few meaningful layers, for example the app window, a key panel and a tooltip, rather than dozens. Keep the 3D tilt mild and move the camera slowly. Soft shadows sell the depth.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Extreme perspective that makes text unreadable, and layers that drift apart so far the interface no longer looks like a real product.",
    },
    {
      type: "h2",
      text: "4. Kinetic typography: when should text animate on screen?",
      id: "kinetic-typography",
    },
    {
      type: "p",
      text: "**What it is.** Words animate on and off in time with the message: sliding, scaling, revealing letter by letter or word by word.",
    },
    {
      type: "p",
      text: "**When to use it.** Hooks, problem statements and calls to action, plus any video that will autoplay on mute. Kinetic type lets the video tell its story without voice-over.",
    },
    {
      type: "p",
      text: "**How to do it well.** Short phrases, large type, one idea per card. Animate words in with a consistent style throughout the video. Leave text on screen long enough to read it twice. Use your brand font and colours so it feels like part of the product.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Full sentences crammed onto one card, too many animation styles in one video, and text competing with busy UI behind it.",
    },
    {
      type: "h2",
      text: "5. UI element build-ons: how do you show a feature being assembled?",
      id: "ui-element-build-ons",
    },
    {
      type: "p",
      text: "**What it is.** Parts of the interface appear one at a time: a sidebar slides in, cards pop into a grid, a chart draws itself, a list fills row by row.",
    },
    {
      type: "p",
      text: "**When to use it.** To show what a product produces, such as a report building, a page generating or a workflow being created. Build-ons turn a static end state into a moment of creation.",
    },
    {
      type: "p",
      text: "**How to do it well.** Stagger elements with short, consistent delays. Build in reading order: top to bottom, left to right. Use a small scale or fade with each element rather than large flying movements.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Building every element on every screen so nothing feels special, and staggers so slow the viewer waits for the animation to finish.",
    },
    {
      type: "h2",
      text: "6. Cursor choreography: does a demo video need a cursor?",
      id: "cursor-choreography",
    },
    {
      type: "p",
      text: "**What it is.** A stylised cursor that moves deliberately to the next action, clicks with a small visual pulse, and triggers the change on screen.",
    },
    {
      type: "p",
      text: "**When to use it.** When the viewer needs to understand that a person is driving the product, such as a click that triggers an automation. Skip it when the point is that something happens automatically.",
    },
    {
      type: "p",
      text: "**How to do it well.** Move in smooth arcs rather than straight lines, arrive slightly before the click, and give each click a subtle press effect. Keep the cursor slightly larger than real size so it reads at small resolutions.",
    },
    {
      type: "p",
      text: "**Common mistakes.** A jittery real-recorded cursor, a cursor that wanders while the narration talks about something else, and clicks with no visible result.",
    },
    {
      type: "cta",
      title: "Get these techniques without After Effects",
      text: "Videly turns your screenshots or product URL plus a short script into a motion-designed video with zooms, focus effects and animated text. Approve the storyboard, then render.",
      href: "/",
      label: "See how Videly works",
    },
    {
      type: "h2",
      text: "7. Transitions and match cuts: how do you move between screens?",
      id: "transitions-and-match-cuts",
    },
    {
      type: "p",
      text: "**What it is.** The way one scene becomes the next. A match cut links two shots through a shared shape, position or element: a button becomes the next screen, a card expands into a full page, a logo morphs into the app icon.",
    },
    {
      type: "p",
      text: "**When to use it.** Between every scene, whether you notice it or not. Match cuts are especially useful for showing cause and effect: click here, and this opens.",
    },
    {
      type: "p",
      text: "**How to do it well.** Prefer transitions that come from the content itself (an element expanding, the camera panning to the next panel) over generic wipes. Keep the transition style consistent for the whole video. Short transitions usually feel more confident than long ones.",
    },
    {
      type: "p",
      text: "**Common mistakes.** A different transition between every scene, preset effects like spins and page curls, and transitions so long they become the main event.",
    },
    {
      type: "h2",
      text: "8. Data and chart animation: how do you make numbers interesting?",
      id: "data-and-chart-animation",
    },
    {
      type: "p",
      text: "**What it is.** Charts that draw on, bars that grow, counters that tick up, and lines that trace a trend from left to right.",
    },
    {
      type: "p",
      text: "**When to use it.** Analytics products, dashboards, and any payoff moment where the result is a number. Animation makes the viewer watch the change happen rather than read a static value.",
    },
    {
      type: "p",
      text: "**How to do it well.** Animate one series at a time. End on a highlighted value with a label that says what it means. Use plausible demo data, and make sure any number shown is clearly sample data rather than a claim about real results.",
    },
    {
      type: "p",
      text: "**Common mistakes.** Animating every chart on a dashboard simultaneously, counters that spin too fast to read, and charts with no labels so the viewer cannot tell what went up.",
    },
    {
      type: "h2",
      text: "9. Logo reveals: how should a SaaS video open and close?",
      id: "logo-reveals",
    },
    {
      type: "p",
      text: "**What it is.** The animated appearance of your logo, usually at the end of a video next to the call to action, sometimes briefly at the start.",
    },
    {
      type: "p",
      text: "**When to use it.** At the end, almost always. At the start, only if the brand is already known to the audience; otherwise the first seconds are better spent on the hook.",
    },
    {
      type: "p",
      text: "**How to do it well.** Keep it short and in character with the brand. A simple scale and fade, a mask reveal or a mark drawing itself is enough. Follow it with the URL or a clear next step.",
    },
    {
      type: "p",
      text: "**Common mistakes.** A long intro sting before the viewer knows why they should care, and an elaborate reveal that clashes with the restrained style of the rest of the video.",
    },
    {
      type: "h2",
      text: "How do you combine motion graphics techniques in one video?",
      id: "combining-techniques",
    },
    {
      type: "p",
      text: "Most strong SaaS videos use a small, consistent toolkit rather than all nine techniques. A typical launch video structure looks like this:",
    },
    {
      type: "table",
      head: ["Beat", "Technique", "Purpose"],
      rows: [
        ["Hook", "Kinetic typography", "State the problem or outcome in a few words"],
        ["Product reveal", "Parallax layers", "Show the product as a premium, tangible object"],
        ["Walkthrough", "Zoom, focus pull, cursor", "Guide the eye through one workflow"],
        ["Result", "UI build-on, chart animation", "Make the payoff feel like it is being created"],
        ["Close", "Logo reveal, kinetic type", "Name the brand and the next step"],
      ],
    },
    {
      type: "p",
      text: "If you are planning a launch, our [launch videos](/launch-videos) page and the [SaaS product launch checklist](/blog/saas-product-launch-checklist) show where a video like this fits alongside the rest of your launch assets.",
    },
    {
      type: "h2",
      text: "How do you make motion graphics without a motion designer?",
      id: "motion-graphics-without-a-designer",
    },
    {
      type: "p",
      text: "Traditionally, these techniques meant hiring a motion designer or agency, or learning tools like After Effects. That is still the right route for a flagship brand film. For the steady stream of launch, feature and demo videos a SaaS team needs, it is often too slow to keep up with releases.",
    },
    {
      type: "p",
      text: "[Videly](/) is built for that gap. You give it screenshots or a product URL and a short script; it proposes a storyboard you approve before rendering, then produces a motion-designed video using your brand kit, with auto captions, optional AI voice-over or your own audio, and exports in 16:9, 1:1 and 9:16.",
    },
    {
      type: "cta",
      title: "Make a launch video from screenshots",
      text: "Start on the free plan with 3,100 credits a month and see your product animated in minutes.",
      href: "/launch-videos",
      label: "Create a launch video",
    },
  ],
  faq: [
    {
      q: "What are motion graphics in a SaaS video?",
      a: "Motion graphics are animated design elements such as moving text, animated UI, charts, transitions and logo reveals. In SaaS videos they are mostly used to animate product screenshots so the interface is readable and the viewer's attention is guided through a workflow.",
    },
    {
      q: "Which motion graphics technique matters most for product videos?",
      a: "Zooming into detail. Full-screen interfaces are hard to read inside a video player, especially on phones, so pushing in on the relevant part of the screen fixes legibility and directs attention at the same time.",
    },
    {
      q: "How many motion techniques should one video use?",
      a: "Usually three to five, used consistently. A small toolkit, such as kinetic type, zooms, focus pulls and a logo reveal, looks more professional than a different effect on every scene.",
    },
    {
      q: "Do I need After Effects to make motion graphics?",
      a: "Not for most SaaS product videos. Motion designers often use tools like After Effects for custom work, but AI tools such as Videly can generate motion-designed product videos from screenshots or a product URL and a short script.",
    },
  ],
};

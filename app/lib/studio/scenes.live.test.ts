// Live smoke for parallel scene writing: real Opus calls (through OpenRouter
// when OPENROUTER_API_KEY is set) + the real renderer. Costs ~$0.5–1 a run,
// so it only runs on request:
//   RUN_LIVE_OPUS=1 npx vitest run app/lib/studio/scenes.live.test.ts
// Writes the document, the frames and a timings/cost summary to
// $TMP/videly-parallel-smoke-<stamp>/.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { usdMicrosForAnthropic, withMeterContext } from "../billing/meter";
import { newTokenBudget, __setStreamImpl } from "./anthropic";
import { shutdownBrowser } from "./browser";
import { captureFrames } from "./render";
import { splitScenes, writeScenesParallel } from "./scenes";
import { FORMAT_PRESETS, type StudioPlan } from "./types";
import { ensureVidelyMeta, validateDocument } from "./validate";

const ENABLED = process.env.RUN_LIVE_OPUS === "1";

// A timed 15 s plan, as runStudioJob hands it to the writing step.
const PLAN: StudioPlan = {
  title: "Orbit — your week, planned",
  concept:
    "A calendar that plans itself. Chaotic sticky-note tasks orbit a glowing core, then snap into a clean weekly grid as Orbit's AI sorts them; the orbit ring becomes the logo.",
  duration: 15,
  palette: ["#0a0b14", "#141833", "#e9e6ff", "#8f7bff", "#ffb547"],
  typography: { heading: "Space Grotesk", body: "Inter" },
  beats: [
    { start: 0, end: 3, visual: "Dozens of tiny task chips drift chaotically around a pulsing violet core; the headline slams in word by word.", technique: "canvas orbit field from absolute t + SplitText words with scale-from-1.4", onScreenText: "Your week is chaos." },
    { start: 3, end: 6, visual: "Camera pushes through the swarm; a few chips enlarge to readable tasks ('Gym', 'Pitch deck', 'Call mom') and collide.", technique: "parallax planes + blur whip + stagger", onScreenText: "Too many tasks." },
    { start: 6, end: 9.5, visual: "The core flashes; every chip is pulled onto orbit rings, then the rings unfold into a 7-column weekly grid and the chips snap into slots.", technique: "Flip-style morph from rings to grid, snap ease", onScreenText: "Orbit plans it for you." },
    { start: 9.5, end: 12, visual: "Close-up of the grid: a Thursday slot glows amber, 'Focus block 9–11' types in, a checkmark draws on.", technique: "DrawSVG checkmark + scramble text", onScreenText: "Focus time, found." },
    { start: 12, end: 15, visual: "The grid collapses back into a single orbit ring that becomes the Orbit logo mark; wordmark and CTA hold.", technique: "shape morph ring→logo, held lockup", onScreenText: "Orbit — Try it free" },
  ],
  voiceover: [
    { text: "Your week is chaos.", start: 0.3, end: 1.9 },
    { text: "Too many tasks, not enough time.", start: 3.1, end: 5.4 },
    { text: "Orbit's AI plans it all for you,", start: 6.1, end: 8.6 },
    { text: "and finds your focus time.", start: 9.6, end: 11.4 },
    { text: "Orbit. Try it free.", start: 12.3, end: 13.8 },
  ],
  musicMood: "upbeat electronic",
  assetRequests: [],
  libraries: ["gsap"],
};

describe.skipIf(!ENABLED)("parallel scenes — live", () => {
  afterAll(async () => {
    __setStreamImpl(null);
    await shutdownBrowser().catch(() => {});
  });

  it(
    "style + scenes + assembly for a 15 s plan, then 3 rendered frames",
    async () => {
      const out = path.join(tmpdir(), `videly-parallel-smoke-${Date.now().toString(36)}`);
      await mkdir(out, { recursive: true });
      const preset = FORMAT_PRESETS["16:9"];
      const scenes = splitScenes(PLAN);
      const budget = newTokenBudget();
      let usd = 0;
      const calls: { label: string; usage: unknown; ms: number }[] = [];

      // Wrap the real stream to collect per-call usage for the cost summary.
      const { getClient } = await import("../hyperframes/llm-director");
      __setStreamImpl(async (params) => {
        const t = Date.now();
        const msg = await getClient()
          .beta.messages.stream(params as never, { timeout: 20 * 60 * 1000 })
          .finalMessage();
        const label = JSON.stringify(params.messages).match(/scene (\d+) of|FOUNDATION JSON/)?.[0] ?? "?";
        calls.push({ label, usage: msg.usage, ms: Date.now() - t });
        usd += usdMicrosForAnthropic(msg.model || "claude-opus-5-5", {
          input_tokens: msg.usage?.input_tokens ?? 0,
          output_tokens: msg.usage?.output_tokens ?? 0,
          cache_creation_input_tokens: msg.usage?.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: msg.usage?.cache_read_input_tokens ?? 0,
        }) / 1e6;
        return msg;
      });

      const started = Date.now();
      const result = await withMeterContext({ userId: null, jobId: null, planTier: null, tokenBudget: budget }, () =>
        writeScenesParallel({
          plan: PLAN,
          preset,
          duration: PLAN.duration,
          fps: 30,
          language: "en",
          voiceover: PLAN.voiceover,
          lockedAssets: [],
          generatedAssets: [],
          brandKit: null,
          reference: null,
          scenes,
          jobId: "live-smoke",
          libraries: PLAN.libraries,
        }),
      );
      const writingMs = Date.now() - started;
      expect(result).not.toBeNull();
      const html = ensureVidelyMeta(result!.html, { duration: 15, fps: 30, width: preset.width, height: preset.height });
      await writeFile(path.join(out, "index.html"), html);

      const report = await validateDocument(html, {
        expect: { duration: 15, fps: 30, width: preset.width, height: preset.height },
        allowedHosts: [],
        seed: 7,
      });
      const cap = await captureFrames(
        { html, width: preset.width, height: preset.height, fps: 30, duration: 15, seed: 7, allowedHosts: [] },
        [2, 7.5, 14],
      );
      for (const f of cap.frames) await writeFile(path.join(out, `frame-${f.time}.jpg`), f.jpeg);

      const summary = {
        out,
        scenes: scenes.map((s) => [s.index, s.start, s.end]),
        writingSeconds: Math.round(writingMs / 100) / 10,
        timings: result!.timings,
        usd: Math.round(usd * 1000) / 1000,
        budgetUsed: budget.used,
        calls,
        sizeKb: Math.round(Buffer.byteLength(html) / 1024),
        validation: { ok: report.ok, errors: report.errors, warnings: report.warnings.map((w) => w.message).slice(0, 10) },
        captureIssues: cap.issues,
      };
      await writeFile(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
      console.log("[live smoke]", JSON.stringify(summary, null, 2));
      expect(cap.frames).toHaveLength(3);
    },
    30 * 60 * 1000,
  );
});

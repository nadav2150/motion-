import OpenAI from "openai";
import { z } from "zod";
import type { FilmMode } from "./director";

const VALIDATOR_MODEL = "gpt-4o";

export const ImageValidationSchema = z.object({
  looksLikePhoto: z.boolean(),
  hasOutdoorElements: z.boolean(),
  hasHumanFace: z.boolean(),
  hasUiElements: z.boolean(),
  isDesignedMotionGraphic: z.boolean(),
  isIndoorWorkspace: z.boolean(),
  looksLikeWallpaperArt: z.boolean(),
  looksLikeLandscape: z.boolean(),
  approved: z.boolean(),
  reasons: z.array(z.string()),
});
export type ImageValidation = z.infer<typeof ImageValidationSchema>;

const VALIDATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "looksLikePhoto",
    "hasOutdoorElements",
    "hasHumanFace",
    "hasUiElements",
    "isDesignedMotionGraphic",
    "isIndoorWorkspace",
    "looksLikeWallpaperArt",
    "looksLikeLandscape",
    "approved",
    "reasons",
  ],
  properties: {
    looksLikePhoto: { type: "boolean" },
    hasOutdoorElements: { type: "boolean" },
    hasHumanFace: { type: "boolean" },
    hasUiElements: { type: "boolean" },
    isDesignedMotionGraphic: { type: "boolean" },
    isIndoorWorkspace: { type: "boolean" },
    looksLikeWallpaperArt: { type: "boolean" },
    looksLikeLandscape: { type: "boolean" },
    approved: { type: "boolean" },
    reasons: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM_PROMPT_BASE = `You inspect generated images for a premium SaaS launch-film system. The system has TWO film modes:

MODE A — motion_design: the image must look like a designed After-Effects / Figma motion-graphic frame. Floating UI cards, gradient backdrops, glassmorphism, typography hierarchy. NOT a photograph. NOT realistic. No real people.

MODE B — cinematic: the image must look like a real indoor photograph of a creator's editing workspace. Real monitors, desk, indoor walls. NOT a landscape, NOT outdoor.

For BOTH modes, never approve images that show: mountains, sky, horizon, trees, forest, ocean, beach, fields, scenic landscape, sunset, sunrise, wallpaper art, concept-art landscape.

Fill every boolean honestly.

- looksLikePhoto: true if the image looks like a real photograph (lens depth, real surfaces, photographic light), not a designed graphic.
- hasOutdoorElements: true if you see ANY mountains, sky, horizon, trees, forest, ocean, beach, fields, scenery, sunset.
- hasHumanFace: true if a real human face is visible in detail.
- hasUiElements: true if recognizable UI cards / charts / panels / dashboards are visible (whether floating or on a monitor).
- isDesignedMotionGraphic: true if the image clearly resembles a designed motion-graphic / After Effects / Figma frame with gradients, glow, glassmorphism, typography hierarchy, layered UI cards.
- isIndoorWorkspace: true if the image clearly resembles a real indoor workspace (desk, monitor, walls).
- looksLikeWallpaperArt: true if the image resembles decorative wallpaper or concept-art landscape rather than the intended output.
- looksLikeLandscape: true if the primary subject is a landscape or scenery.

THEN compute approved based on the active mode (the user message will tell you which mode is active). Be strict — borderline outdoor or borderline wallpaper must fail.`;

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_API_KEY });

export async function validateGeneratedImage(args: {
  imageUrl: string;
  requiresUi: boolean;
  mode: FilmMode;
}): Promise<ImageValidation> {
  const userText =
    args.mode === "motion_design"
      ? `ACTIVE MODE: motion_design.
approved must be true ONLY if:
- isDesignedMotionGraphic === true
- looksLikePhoto === false
- hasOutdoorElements === false
- hasHumanFace === false
- looksLikeWallpaperArt === false
- looksLikeLandscape === false
${args.requiresUi ? "- hasUiElements === true (UI cards are required for this shot)" : ""}`
      : `ACTIVE MODE: cinematic.
approved must be true ONLY if:
- isIndoorWorkspace === true
- hasOutdoorElements === false
- looksLikeWallpaperArt === false
- looksLikeLandscape === false
${args.requiresUi ? "- hasUiElements === true (a real monitor showing software UI is required for this shot)" : ""}`;

  // gpt-4o vision occasionally fails with "400 Timeout while downloading" when
  // the Supabase Storage URL hasn't propagated to the CDN yet. One retry with
  // a short backoff is enough in practice.
  const MAX_ATTEMPTS = 2;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: VALIDATOR_MODEL,
        temperature: 0,
        max_tokens: 600,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "image_validation",
            strict: true,
            schema: VALIDATION_JSON_SCHEMA,
          },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT_BASE },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: args.imageUrl } },
            ],
          },
        ],
      });

      const text = completion.choices[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`Validator returned non-JSON: ${(err as Error).message}`);
      }
      return ImageValidationSchema.parse(parsed);
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const isImageDownloadTimeout =
        message.includes("Timeout while downloading") || message.includes("400");
      if (attempt < MAX_ATTEMPTS && isImageDownloadTimeout) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("validateGeneratedImage exhausted retries");
}

export function summarizeValidation(v: ImageValidation): string {
  if (v.approved) return "approved";
  return v.reasons.length > 0 ? v.reasons.join("; ") : "rejected";
}

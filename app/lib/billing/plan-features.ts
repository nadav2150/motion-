// Plan feature matrix — what each tier is allowed to do. Single source of
// truth for both client-side UI (show/hide features) and server-side gating
// (refuse requests for features the plan doesn't include). See the PLAN at
// C:\Users\User\.claude\plans\i-pay-alot-of-elegant-sutherland.md for the
// pricing rationale behind these caps.

export type PlanTier = "free" | "starter" | "pro" | "studio";

export type PlanFeatures = {
  maxScenes: number;
  audio: boolean;          // voiceover/music/sfx (gated together — audio_*_enabled flags)
  critique: boolean;       // POST /api/jobs/:id/critique
  polish: boolean;         // POST /api/jobs/:id/improve
  brandKit: boolean;       // POST /api/brand/logo
  watermark: boolean;      // append "Made with MotionFlow" to export
  export4k: boolean;       // 4K export option in /export
  concurrentJobs: number;  // max in-flight (non-terminal) jobs per user
  commercialUse: boolean;  // TOS-only — surfaced in UI, not enforced server-side
  apiAccess: boolean;      // can mint API tokens for programmatic /api/jobs
  teamSeats: number;       // 1 = solo; future feature
};

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  free: {
    maxScenes: 6,
    audio: false,
    critique: false,
    polish: false,
    brandKit: false,
    watermark: true,
    export4k: false,
    concurrentJobs: 1,
    commercialUse: false,
    apiAccess: false,
    teamSeats: 1,
  },
  starter: {
    maxScenes: 10,
    audio: true,
    // Starter can run vision critique to iterate on drafts (~1,200 credits/run,
    // ~6 critiques fit in the 8K monthly grant). Polish stays Pro+ since it
    // re-fires the expensive Opus refinement pipeline.
    critique: true,
    polish: false,
    brandKit: true,
    watermark: false,
    export4k: false,
    concurrentJobs: 2,
    commercialUse: true,
    apiAccess: false,
    teamSeats: 1,
  },
  pro: {
    maxScenes: 14,
    audio: true,
    critique: true,
    polish: true,
    brandKit: true,
    watermark: false,
    export4k: true,
    concurrentJobs: 5,
    commercialUse: true,
    apiAccess: false,
    teamSeats: 1,
  },
  studio: {
    maxScenes: 14,
    audio: true,
    critique: true,
    polish: true,
    brandKit: true,
    watermark: false,
    export4k: true,
    concurrentJobs: 10,
    commercialUse: true,
    apiAccess: true,
    teamSeats: 3,
  },
};

export function getPlanFeatures(tier: string | null | undefined): PlanFeatures {
  if (tier && tier in PLAN_FEATURES) return PLAN_FEATURES[tier as PlanTier];
  return PLAN_FEATURES.free;
}

export type AudioTrackRequest = {
  voiceover?: boolean;
  music?: boolean;
  sfx?: boolean;
};

// Clamp the user-requested audio tracks down to what their plan allows.
// Free tier silently drops all audio. Paid tiers pass through unchanged.
export function clampAudioTracksToPlan(
  tier: string | null | undefined,
  requested: AudioTrackRequest,
): { voiceover: boolean; music: boolean; sfx: boolean } {
  const feat = getPlanFeatures(tier);
  if (!feat.audio) {
    return { voiceover: false, music: false, sfx: false };
  }
  return {
    voiceover: requested.voiceover === true,
    music: requested.music === true,
    sfx: requested.sfx === true,
  };
}

export class PlanFeatureError extends Error {
  constructor(
    public feature: keyof PlanFeatures,
    public tier: string,
    public status = 403,
  ) {
    super(`Feature "${feature}" not available on plan "${tier}"`);
    this.name = "PlanFeatureError";
  }
}

// Throws PlanFeatureError if the user's plan doesn't include the named
// boolean feature. Use this in API route guards (critique, polish, brandKit,
// apiAccess).
export function assertFeature(
  tier: string | null | undefined,
  feature: keyof PlanFeatures,
): void {
  const feat = getPlanFeatures(tier);
  const value = feat[feature];
  if (typeof value === "boolean" && !value) {
    throw new PlanFeatureError(feature, tier ?? "free");
  }
}

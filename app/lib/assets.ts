// Asset sourcing (Stage 2 of the v2 quality pipeline).
//
// Pure orchestration — no LLM calls. Takes the AssetPlan produced by
// generateAssetPlan and resolves every declared need into a concrete URL
// (or a passthrough cssDirective for synthetic_css slots). All slots resolve
// in parallel.
//
// Source resolution rules:
//   • user_asset    — look up by id in the job-context asset list, return URL.
//   • flux          — call runImage(FLUX_ULTRA, fluxPrompt), mirror to Supabase
//                     Storage at jobs/<jobId>/assets/<sceneId>/<slot> so the
//                     final composition references a stable URL even after the
//                     Replicate CDN URL expires.
//   • unsplash      — build https://source.unsplash.com/1920x1080/?<keyword>.
//                     No mirroring (the Unsplash redirect is stable enough).
//   • synthetic_css — pass through cssDirective only. No URL is produced.
//
// Failures are logged and the slot is dropped from the resolved catalog —
// scene generation degrades gracefully (the scene falls back to its brief
// without that asset) rather than failing the whole film.

import {
  type AssetPlan,
  type AssetSlotPlan,
  type SourcedAssetCatalog,
  type SourcedAssetSlot,
} from "./hyperframes/llm-director";
import { FLUX_ULTRA, runImage } from "./replicate";
import { mirrorAssetForJob } from "./storage";

export type JobAssetEntry = {
  id: string;
  kind: string;
  url: string;
  name?: string;
};

export type SourceAssetsArgs = {
  jobId: string;
  plan: AssetPlan;
  /**
   * Assets already attached to the job (jobs.assets + a virtual entry for
   * brand_logo_url when present, synthesized by the caller). Looked up by
   * AssetSlotPlan.userAssetId when source = "user_asset".
   */
  jobAssets: JobAssetEntry[];
};

function unsplashUrl(keyword: string): string {
  return `https://source.unsplash.com/1920x1080/?${encodeURIComponent(keyword)}`;
}

async function resolveSlot(
  jobId: string,
  sceneId: string,
  need: AssetSlotPlan,
  jobAssets: JobAssetEntry[],
): Promise<SourcedAssetSlot | null> {
  switch (need.source) {
    case "user_asset": {
      if (!need.userAssetId) {
        console.warn(
          `[assets source] ${sceneId}/${need.slot} user_asset has no userAssetId — dropping`,
        );
        return null;
      }
      const match = jobAssets.find((a) => a.id === need.userAssetId);
      if (!match) {
        console.warn(
          `[assets source] ${sceneId}/${need.slot} user_asset id="${need.userAssetId}" not found in jobAssets — dropping`,
        );
        return null;
      }
      return {
        slot: need.slot,
        role: need.role,
        source: "user_asset",
        url: match.url,
      };
    }

    case "flux": {
      if (!need.fluxPrompt) {
        console.warn(
          `[assets source] ${sceneId}/${need.slot} flux has no fluxPrompt — dropping`,
        );
        return null;
      }
      try {
        const result = await runImage({
          model: FLUX_ULTRA,
          prompt: need.fluxPrompt,
          negativePrompt: need.negativePrompt,
          aspectRatio: "16:9",
        });
        // Mirror to Supabase for URL stability. If the mirror fails, fall
        // back to the Replicate URL (matches the legacy renderAndMirror
        // pattern in jobs.ts).
        let url = result.url;
        try {
          const mirrored = await mirrorAssetForJob(jobId, sceneId, need.slot, result.url);
          url = mirrored.publicUrl;
        } catch (mirrorErr) {
          console.warn(
            `[assets source] ${sceneId}/${need.slot} mirror failed; using Replicate URL: ` +
              (mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr)),
          );
        }
        return { slot: need.slot, role: need.role, source: "flux", url };
      } catch (err) {
        console.error(
          `[assets source] ${sceneId}/${need.slot} flux failed: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        return null;
      }
    }

    case "unsplash": {
      if (!need.unsplashKeyword) {
        console.warn(
          `[assets source] ${sceneId}/${need.slot} unsplash has no keyword — dropping`,
        );
        return null;
      }
      return {
        slot: need.slot,
        role: need.role,
        source: "unsplash",
        url: unsplashUrl(need.unsplashKeyword),
      };
    }

    case "synthetic_css": {
      if (!need.cssDirective) {
        console.warn(
          `[assets source] ${sceneId}/${need.slot} synthetic_css has no cssDirective — dropping`,
        );
        return null;
      }
      return {
        slot: need.slot,
        role: need.role,
        source: "synthetic_css",
        cssDirective: need.cssDirective,
      };
    }

    default: {
      const _exhaustive: never = need.source;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Walk the AssetPlan and resolve every slot to a concrete asset URL (or
 * cssDirective for synthetic slots). Fully parallel across all scenes × slots
 * to keep wall time bounded by the slowest single Flux call.
 */
export async function sourceAssets(
  args: SourceAssetsArgs,
): Promise<SourcedAssetCatalog> {
  const { jobId, plan, jobAssets } = args;

  // Flatten into one big parallel job, keep the sceneId so we can re-bucket.
  type ResolveJob = { sceneId: string; need: AssetSlotPlan };
  const jobs: ResolveJob[] = [];
  for (const scene of plan.scenes) {
    for (const need of scene.needs) jobs.push({ sceneId: scene.sceneId, need });
  }

  const t0 = Date.now();
  const resolved = await Promise.all(
    jobs.map((j) => resolveSlot(jobId, j.sceneId, j.need, jobAssets)),
  );
  const elapsed = Date.now() - t0;

  const catalog: SourcedAssetCatalog = { scenes: {} };
  for (let i = 0; i < jobs.length; i++) {
    const slot = resolved[i];
    if (!slot) continue;
    const sceneId = jobs[i].sceneId;
    if (!catalog.scenes[sceneId]) catalog.scenes[sceneId] = [];
    catalog.scenes[sceneId].push(slot);
  }

  const totalIn = jobs.length;
  const totalOut = resolved.filter(Boolean).length;
  console.log(
    `[assets source] resolved ${totalOut}/${totalIn} slots across ${Object.keys(catalog.scenes).length} scenes in ${elapsed}ms`,
  );

  return catalog;
}

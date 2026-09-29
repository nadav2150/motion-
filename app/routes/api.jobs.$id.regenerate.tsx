import type { Route } from "./+types/api.jobs.$id.regenerate";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling, reserveCredits } from "../lib/billing/credits";
import { getPlanFeatures } from "../lib/billing/plan-features";
import { getOwnedStudioJob, nextRevisionNumber, setStage } from "../lib/studio/db";
import { claimForOperation, JobBusyError } from "../lib/studio/edit";
import { estimateStudioJob } from "../lib/studio/estimate";
import { maxVideoDuration } from "../lib/studio/format";
import { runStudioJob } from "../lib/studio/generate";

// POST /api/jobs/:id/regenerate {} → 202 { revision } (fresh generation from the same inputs)
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }

  let restore;
  try {
    restore = await claimForOperation(row, "planning");
  } catch (err) {
    if (err instanceof JobBusyError) return Response.json({ error: err.message }, { status: 409, headers });
    throw err;
  }

  const billing = await getOrCreateBilling(user.id);
  const features = getPlanFeatures(billing.plan_tier);
  const target = Number(row.target_duration ?? 30);
  const analysis = row.reference_analysis;
  const amount = estimateStudioJob({
    targetDuration: target,
    maxDuration: maxVideoDuration(target, features.maxStudioDuration),
    voiceover: !!row.voice_id && features.audio,
    music: !!row.music_enabled && features.audio,
    reference: !!row.reference_video_url && !(analysis && "summary" in analysis),
  }).total;
  const reserve = await reserveCredits(user.id, amount, row.id, `reserve:regen:${row.id}:${crypto.randomUUID()}`);
  if (!reserve.ok) {
    await setStage(row.id, restore).catch(() => {});
    return Response.json(
      { error: "insufficient_credits", needed: reserve.required, balance: reserve.balance },
      { status: 402, headers },
    );
  }

  const revision = await nextRevisionNumber(row.id);
  void runStudioJob(row.id, { kind: "regenerate", restoreStage: restore }).catch((err) =>
    console.error(`regenerate(${row.id}) threw:`, err),
  );
  return Response.json({ revision }, { status: 202, headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

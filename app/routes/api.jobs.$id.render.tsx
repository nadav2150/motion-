import type { Route } from "./+types/api.jobs.$id.render";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling, reserveCredits } from "../lib/billing/credits";
import { getPlanFeatures } from "../lib/billing/plan-features";
import { getOwnedStudioJob, getRevision, jobDuration, setStage, updateRevision } from "../lib/studio/db";
import { claimForOperation, JobBusyError } from "../lib/studio/edit";
import { estimateStudioRender } from "../lib/studio/estimate";
import { enqueueClaimedOperation } from "../lib/studio/queue";
import { parseExportOptions } from "../lib/studio/format";

// POST /api/jobs/:id/render ExportOptions → 202 { revision, renderStatus }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const billing = await getOrCreateBilling(user.id);
  const features = getPlanFeatures(billing.plan_tier);
  const parsed = parseExportOptions(body, features);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: parsed.status, headers });
  const revision = parsed.revision ?? row.current_revision ?? 0;
  if (!(await getRevision(row.id, revision))) {
    return Response.json({ error: "Unknown revision" }, { status: 400, headers });
  }

  let restore;
  try {
    restore = await claimForOperation(row, "rendering");
  } catch (err) {
    if (err instanceof JobBusyError) return Response.json({ error: err.message }, { status: 409, headers });
    throw err;
  }

  const seconds = jobDuration(row) ?? Number(row.target_duration ?? 30);
  const amount = estimateStudioRender(seconds, parsed.resolution);
  const reserve = await reserveCredits(user.id, amount, row.id, `reserve:render:${row.id}:${crypto.randomUUID()}`);
  if (!reserve.ok) {
    await setStage(row.id, restore).catch(() => {});
    return Response.json(
      { error: "insufficient_credits", needed: reserve.required, balance: reserve.balance },
      { status: 402, headers },
    );
  }

  await updateRevision(row.id, revision, { render_status: "queued", render_error: null, render_options: { ...parsed, revision } });
  const queued = await enqueueClaimedOperation(row.id, "render", { options: { ...parsed, revision }, restoreStage: restore });
  if (!queued.ok) {
    await updateRevision(row.id, revision, { render_status: "failed", render_error: queued.error }).catch(() => {});
    return Response.json({ error: queued.error }, { status: queued.status, headers });
  }
  return Response.json({ revision, renderStatus: "queued" }, { status: 202, headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

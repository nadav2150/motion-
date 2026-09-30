import type { Route } from "./+types/api.jobs.$id.edit";
import { requireUserApi } from "../lib/auth";
import { reserveCredits } from "../lib/billing/credits";
import { getOwnedStudioJob, getRevision, nextRevisionNumber, setStage } from "../lib/studio/db";
import { claimForOperation, JobBusyError } from "../lib/studio/edit";
import { enqueueClaimedOperation } from "../lib/studio/queue";
import { estimateStudioEdit } from "../lib/studio/estimate";

const MAX_INSTRUCTION_CHARS = 2000;

// POST /api/jobs/:id/edit { instruction, revision? } → 202 { revision } · 409 busy · 402
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return Response.json({ error: "instruction is required" }, { status: 400, headers });
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return Response.json({ error: `instruction must be ≤ ${MAX_INSTRUCTION_CHARS} characters` }, { status: 400, headers });
  }
  let baseRevision: number | undefined;
  if (body.revision !== undefined && body.revision !== null) {
    baseRevision = Number(body.revision);
    if (!Number.isInteger(baseRevision) || !(await getRevision(row.id, baseRevision))) {
      return Response.json({ error: "Unknown revision" }, { status: 400, headers });
    }
  } else if (!row.current_revision) {
    return Response.json({ error: "This video has no version to edit yet" }, { status: 409, headers });
  }

  let restore;
  try {
    restore = await claimForOperation(row, "writing");
  } catch (err) {
    if (err instanceof JobBusyError) return Response.json({ error: err.message }, { status: 409, headers });
    throw err;
  }

  const amount = estimateStudioEdit();
  const reserve = await reserveCredits(user.id, amount, row.id, `reserve:edit:${row.id}:${crypto.randomUUID()}`).catch(
    (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }) as const,
  );
  if ("error" in reserve || !reserve.ok) {
    await setStage(row.id, restore).catch(() => {});
    if ("error" in reserve) return Response.json({ error: reserve.error }, { status: 500, headers });
    return Response.json(
      { error: "insufficient_credits", needed: reserve.required, balance: reserve.balance },
      { status: 402, headers },
    );
  }

  const revision = await nextRevisionNumber(row.id);
  const queued = await enqueueClaimedOperation(row.id, "edit", {
    instruction,
    baseRevision: baseRevision ?? null,
    restoreStage: restore,
    expectedRevision: revision,
  });
  if (!queued.ok) return Response.json({ error: queued.error }, { status: queued.status, headers });
  return Response.json({ revision }, { status: 202, headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

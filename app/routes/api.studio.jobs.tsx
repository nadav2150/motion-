import type { Route } from "./+types/api.studio.jobs";
import { requireUserApi } from "../lib/auth";
import { getOrCreateBilling } from "../lib/billing/credits";
import { getPlanFeatures } from "../lib/billing/plan-features";
import { storageHost } from "../lib/studio/db";
import {
  createStudioJob,
  parseCreateStudioJobInput,
  policyFor,
  StudioCreditsError,
  StudioInputError,
} from "../lib/studio/generate";

// POST /api/studio/jobs — CreateStudioJobInput → 201 { id }
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const { user, headers } = await requireUserApi(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  try {
    const billing = await getOrCreateBilling(user.id);
    const features = getPlanFeatures(billing.plan_tier);
    const input = parseCreateStudioJobInput(body, { ...policyFor(features), storageHost: storageHost() });
    const { id } = await createStudioJob(input, user);
    return Response.json({ id }, { status: 201, headers });
  } catch (err) {
    if (err instanceof StudioInputError) {
      return Response.json({ error: err.message }, { status: 400, headers });
    }
    if (err instanceof StudioCreditsError) {
      return Response.json(
        { error: "insufficient_credits", needed: err.needed, balance: err.balance },
        { status: 402, headers },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/studio/jobs POST failed:", message);
    return Response.json({ error: message }, { status: 500, headers });
  }
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

import type { Route } from "./+types/api.jobs.$id.document";
import { requireUserApi } from "../lib/auth";
import { buildClockShim } from "../lib/studio/clock-shim";
import { downloadText, getOwnedStudioJob, getRevision, storageHost } from "../lib/studio/db";
import { planWatermark } from "../lib/studio/edit";
import { injectStudioWatermark } from "../lib/studio/generate";
import { buildDocumentCsp, injectShim } from "../lib/studio/format";

// GET /api/jobs/:id/document?rev=n → text/html (preview, sandboxed same-origin iframe)
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, headers } = await requireUserApi(request);
  const row = params.id ? await getOwnedStudioJob(params.id, user.id) : null;
  if (!row || row.generation_mode !== "v2") {
    return Response.json({ error: "Job not found" }, { status: 404, headers });
  }
  const url = new URL(request.url);
  const revParam = url.searchParams.get("rev");
  const revision = revParam ? Number(revParam) : (row.current_revision ?? 0);
  const rev = Number.isInteger(revision) ? await getRevision(row.id, revision) : null;
  if (!rev) return Response.json({ error: "Revision not found" }, { status: 404, headers });

  let shim: string;
  try {
    shim = buildClockShim({ seed: row.seed ?? 1, mode: "preview" });
  } catch (err) {
    return Response.json(
      { error: `Preview is not available: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503, headers },
    );
  }
  let html = await downloadText(rev.html_path);
  if (await planWatermark(row.user_id)) html = injectStudioWatermark(html);
  html = injectShim(html, shim);

  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", buildDocumentCsp(storageHost()));
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(html, { status: 200, headers });
}

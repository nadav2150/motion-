import type { Route } from "./+types/api.share";
import { requireAdminApi } from "../lib/admin";
import { getRevision, getStudioJob } from "../lib/studio/db";
import { createSharedVideo, setSharedVideoDisabled, shareUrl } from "../lib/share";

// POST /api/share (admin only)
//   { jobId, revision?, title?, recipient?, message?, slug? } → share link for a Studio revision
//   { action: "disable", id, disabled }                       → turn a link off / back on
export async function action({ request }: Route.ActionArgs) {
  const { user, headers } = await requireAdminApi(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400, headers });

  if (body.action === "disable") {
    if (typeof body.id !== "string") return Response.json({ error: "id required" }, { status: 400, headers });
    await setSharedVideoDisabled(body.id, body.disabled !== false);
    return Response.json({ ok: true }, { headers });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : null;
  const job = jobId ? await getStudioJob(jobId) : null;
  if (!job || job.deleted_at) return Response.json({ error: "Job not found" }, { status: 404, headers });

  const revision = Number.isInteger(body.revision) ? (body.revision as number) : (job.current_revision ?? 0);
  const rev = await getRevision(job.id, revision);
  if (!rev?.video_path || rev.render_status !== "ready") {
    return Response.json({ error: "Export this version first, then create the share link" }, { status: 409, headers });
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const row = await createSharedVideo({
    title: str(body.title) ?? job.title ?? "Your video",
    recipient: str(body.recipient),
    message: str(body.message),
    slug: str(body.slug),
    jobId: job.id,
    videoPath: rev.video_path,
    thumbPath: rev.thumb_path ?? null,
    createdBy: user.id,
  });
  return Response.json({ slug: row.slug, url: shareUrl(row.slug) }, { headers });
}

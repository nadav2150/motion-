// Document improvement toolkit + chat edits.
//
//   applyPatchEdits()     exact find/replace application (pure)
//   patchOrRewrite()      model patch first, full rewrite as fallback
//   repairUntilValid()    validate → repair loop (max 2 rounds)
//   withStudioOperation() meter context + token budget + reconcile + flush
//   applyChatEdit()       POST /api/jobs/:id/edit → new revision

import { getOrCreateBilling, reconcileJob } from "../billing/credits";
import { withMeterContext } from "../billing/meter";
import { getPlanFeatures } from "../billing/plan-features";
import { flushPostHog, getPostHog } from "../posthog";
import { uploadBuffer } from "../storage";
import { callOpus, extractHtmlDocument, newTokenBudget } from "./anthropic";
import {
  claimJob,
  downloadText,
  getRevision,
  getStudioJob,
  insertRevision,
  jobDuration,
  nextRevisionNumber,
  revisionPaths,
  setStage,
  stageOf,
  storageHost,
  type StudioJobRow,
} from "./db";
import { MAX_REPAIR_ROUNDS } from "./estimate";
import {
  buildEditMessages,
  buildRepairMessages,
  buildRewriteMessages,
  EDIT_TASK,
  PATCH_SCHEMA,
  REPAIR_TASK,
  REWRITE_TASK,
  systemFor,
  type PatchEdit,
  type PatchResponse,
} from "./prompts";
import { DEFAULT_FPS, FORMAT_PRESETS, type FormatPreset, type StudioStage } from "./types";
import { ensureVidelyMeta, validateDocument, type ValidationIssue, type ValidationReport } from "./validate";
import { formatForSize } from "./format";

// ─── Exact patches ─────────────────────────────────────────────────────────

export type PatchResult =
  | { ok: true; html: string; applied: number }
  | { ok: false; html: string; applied: number; failedIndex: number; reason: "missing" | "ambiguous" | "empty" };

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    if (n > 1) return n;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Apply edits in order. Each `find` must occur exactly once in the document
 * as it stands after the previous edits; otherwise stop and report which edit
 * failed (the caller falls back to a full rewrite).
 */
export function applyPatchEdits(html: string, edits: PatchEdit[]): PatchResult {
  let doc = html;
  for (let i = 0; i < edits.length; i++) {
    const { find, replace } = edits[i]!;
    if (!find) return { ok: false, html, applied: i, failedIndex: i, reason: "empty" };
    const n = countOccurrences(doc, find);
    if (n === 0) return { ok: false, html, applied: i, failedIndex: i, reason: "missing" };
    if (n > 1) return { ok: false, html, applied: i, failedIndex: i, reason: "ambiguous" };
    const at = doc.indexOf(find);
    doc = doc.slice(0, at) + replace + doc.slice(at + find.length);
  }
  return { ok: true, html: doc, applied: edits.length };
}

// ─── Document context ──────────────────────────────────────────────────────

export type DocContext = {
  preset: FormatPreset;
  duration: number;
  fps: number;
  seed: number;
  allowedHosts: string[];
};

export function docContextFor(row: StudioJobRow, durationOverride?: number): DocContext {
  const width = row.width ?? 1920;
  const height = row.height ?? 1080;
  const key = formatForSize(width, height);
  const preset: FormatPreset = { ...FORMAT_PRESETS[key], width, height };
  const host = storageHost();
  return {
    preset,
    duration: durationOverride ?? jobDuration(row) ?? Number(row.target_duration ?? 15),
    fps: row.fps ?? DEFAULT_FPS,
    seed: row.seed ?? 1,
    allowedHosts: host ? [host] : [],
  };
}

export function validateWith(html: string, d: DocContext): Promise<ValidationReport> {
  return validateDocument(html, {
    expect: { duration: d.duration, fps: d.fps, width: d.preset.width, height: d.preset.height },
    allowedHosts: d.allowedHosts,
    seed: d.seed,
  });
}

// Errors that make a document unusable; anything else ships with a warning
// after the repair budget is spent.
const BLOCKING: ValidationIssue["code"][] = [
  "parse",
  "meta_missing",
  "meta_mismatch",
  "network_api",
  "script_src",
  "external_url",
  "embedded_audio",
  "too_large",
  "static_video",
];

export function hasBlockingErrors(report: ValidationReport): boolean {
  return report.errors.some((e) => BLOCKING.includes(e.code));
}

export class RendererUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererUnavailableError";
  }
}

// ─── Model patch / rewrite ─────────────────────────────────────────────────

export type ImproveRequest =
  | { kind: "repair"; issues: ValidationIssue[] }
  | { kind: "edit"; instruction: string };

export type ImproveResult = { html: string; mode: "patch" | "rewrite"; summary: string };

export async function patchOrRewrite(html: string, req: ImproveRequest, d: DocContext): Promise<ImproveResult> {
  const meta = { duration: d.duration, preset: d.preset, fps: d.fps };
  const reason = req.kind === "repair" ? "opus_studio_repair" : "opus_studio_edit";
  const patch = await callOpus<PatchResponse>({
    system: systemFor(req.kind === "repair" ? REPAIR_TASK : EDIT_TASK),
    messages:
      req.kind === "repair"
        ? buildRepairMessages(html, req.issues)
        : buildEditMessages(html, req.instruction, meta),
    schema: PATCH_SCHEMA as unknown as Record<string, unknown>,
    effort: "high",
    maxTokens: 32_000,
    reason,
    label: `${req.kind}-patch`,
  });
  const p = patch.json!;
  const summary = p.summary?.trim() || (req.kind === "repair" ? "Fixed validation issues" : "Applied edit");
  if (p.mode === "patch" && p.edits.length > 0) {
    const applied = applyPatchEdits(html, p.edits);
    if (applied.ok) return { html: applied.html, mode: "patch", summary };
    console.warn(`[studio ${req.kind}] patch edit #${applied.failedIndex} ${applied.reason}; falling back to rewrite`);
  }

  const rewrite = await callOpus({
    system: systemFor(REWRITE_TASK),
    messages: buildRewriteMessages(
      html,
      req.kind === "repair" ? { issues: req.issues } : { instruction: req.instruction },
      meta,
    ),
    effort: "high",
    maxTokens: 128_000,
    reason,
    label: `${req.kind}-rewrite`,
  });
  const doc = extractHtmlDocument(rewrite.text);
  if (!doc) throw new Error(`${req.kind} rewrite did not return an HTML document`);
  return { html: doc, mode: "rewrite", summary };
}

/**
 * Validate; while there are errors and rounds left, ask for a repair.
 * Throws RendererUnavailableError when the smoke render itself cannot run
 * (infrastructure, not the document's fault).
 */
export async function repairUntilValid(
  html: string,
  d: DocContext,
  opts: { maxRounds?: number; onRound?: (round: number) => Promise<void> | void } = {},
): Promise<{ html: string; report: ValidationReport; rounds: number }> {
  const maxRounds = opts.maxRounds ?? MAX_REPAIR_ROUNDS;
  const expect = { duration: d.duration, fps: d.fps, width: d.preset.width, height: d.preset.height };
  html = ensureVidelyMeta(html, expect);
  let report = await validateWith(html, d);
  let rounds = 0;
  while (!report.ok) {
    const infra = report.errors.find((e) => e.code === "render_failed");
    if (infra) throw new RendererUnavailableError(infra.message);
    if (rounds >= maxRounds) break;
    rounds++;
    await opts.onRound?.(rounds);
    console.log(
      `[studio repair] round ${rounds}: ${report.errors.map((e) => e.code).join(", ")}`,
    );
    const fixed = await patchOrRewrite(html, { kind: "repair", issues: report.errors }, d);
    html = ensureVidelyMeta(fixed.html, expect);
    report = await validateWith(html, d);
  }
  return { html, report, rounds };
}

// ─── Operation wrapper ─────────────────────────────────────────────────────

/**
 * Run one Studio operation on a job: ambient meter context with a fresh token
 * budget, then settle credits (reconcileJob) and flush PostHog.
 *
 * Credits are settled only when the operation concludes (operations handle
 * their own failures by restoring / failing the stage). If it throws, the
 * worker retries the task — settling now would refund the reservation the
 * retry still needs — or, with no attempts left, fails it and settles
 * (queue.ts settleFailedTask).
 */
export async function withStudioOperation<T>(
  row: Pick<StudioJobRow, "id" | "user_id">,
  fn: () => Promise<T>,
): Promise<T> {
  let planTier: string | null = null;
  if (row.user_id) {
    planTier = (await getOrCreateBilling(row.user_id).catch(() => null))?.plan_tier ?? null;
  }
  return withMeterContext(
    { userId: row.user_id, jobId: row.id, planTier, tokenBudget: newTokenBudget() },
    async () => {
      try {
        const out = await fn();
        await reconcileJob(row.id).catch((err) =>
          console.error(`[studio ${row.id}] reconcile failed:`, err instanceof Error ? err.message : err),
        );
        return out;
      } finally {
        await flushPostHog();
      }
    },
  );
}

export async function planWatermark(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const billing = await getOrCreateBilling(userId).catch(() => null);
  return getPlanFeatures(billing?.plan_tier ?? null).watermark;
}

// ─── Save a revision ───────────────────────────────────────────────────────

export async function saveRevision(args: {
  jobId: string;
  revision: number;
  kind: "initial" | "review" | "edit" | "regenerate";
  instruction: string | null;
  html: string;
  thumbJpeg: Buffer | null;
  credits?: number | null;
}): Promise<void> {
  const paths = revisionPaths(args.jobId, args.revision);
  await uploadBuffer({ storagePath: paths.html, body: Buffer.from(args.html, "utf8"), contentType: "text/html; charset=utf-8" });
  let thumbPath: string | null = null;
  if (args.thumbJpeg) {
    try {
      const sharp = (await import("sharp")).default;
      const small = await sharp(args.thumbJpeg).resize({ width: 640 }).jpeg({ quality: 82 }).toBuffer();
      await uploadBuffer({ storagePath: paths.thumb, body: small, contentType: "image/jpeg" });
      thumbPath = paths.thumb;
    } catch (err) {
      console.warn(`[studio ${args.jobId}] thumbnail upload failed:`, err instanceof Error ? err.message : err);
    }
  }
  await insertRevision({
    jobId: args.jobId,
    revision: args.revision,
    kind: args.kind,
    instruction: args.instruction,
    htmlPath: paths.html,
    thumbPath,
    credits: args.credits ?? null,
  });
}

/** The frame used for thumbnails: ~30% in, else the last sampled frame. */
export function pickThumbFrame(frames: { time: number; jpeg: Buffer }[]): Buffer | null {
  if (frames.length === 0) return null;
  return (frames[2] ?? frames[frames.length - 1])!.jpeg;
}

// ─── Chat edit ─────────────────────────────────────────────────────────────

export class JobBusyError extends Error {
  constructor() {
    super("This video is busy — wait for the current step to finish.");
    this.name = "JobBusyError";
  }
}

/**
 * Claim the job (409 if busy) and return the stage to restore on failure.
 * Exported for the routes, which claim before reserving credits.
 */
export async function claimForOperation(row: StudioJobRow, stage: StudioStage): Promise<StudioStage> {
  const previous = stageOf(row);
  const ok = await claimJob(row.id, stage);
  if (!ok) throw new JobBusyError();
  return previous === "failed" ? "preview_ready" : previous;
}

/** The duration a document declares in `window.__videly = { duration }`, clamped. */
export function declaredDuration(html: string): number | null {
  const m = /__videly\s*=\s*\{[^}]*\bduration\s*:\s*(\d+(?:\.\d+)?)/.exec(html);
  return m ? Math.min(120, Math.max(3, Number(m[1]))) : null;
}

/**
 * Apply a chat instruction to a revision (default: current) and store the
 * result as a new revision. The job must already be claimed (stage
 * "writing") by the caller; the worker runs this from an "edit" task.
 *
 * `expectedRevision` is the revision number the route promised (the job is
 * claimed, so nothing else adds revisions meanwhile). When a re-claimed task
 * finds that revision already saved as an edit, the edit is not redone: the
 * job just moves to it.
 */
export async function applyChatEdit(
  jobId: string,
  instruction: string,
  baseRevision?: number,
  restoreStage: StudioStage = "preview_ready",
  opts: { expectedRevision?: number } = {},
): Promise<number | null> {
  const row = await getStudioJob(jobId);
  if (!row) throw new Error(`applyChatEdit: job ${jobId} not found`);
  return withStudioOperation(row, async () => {
    try {
      if (opts.expectedRevision !== undefined) {
        const saved = await getRevision(jobId, opts.expectedRevision);
        if (saved?.kind === "edit") {
          const d = docContextFor(row);
          const newDuration = declaredDuration(await downloadText(saved.html_path)) ?? d.duration;
          const planRecord = row.studio_plan;
          await setStage(jobId, "preview_ready", {
            current_revision: saved.revision,
            error: null,
            ...(planRecord && newDuration !== d.duration ? { studio_plan: { ...planRecord, finalDuration: newDuration } } : {}),
          });
          console.log(`[studio ${jobId}] edit revision ${saved.revision} was already saved; resumed without redoing it`);
          return saved.revision;
        }
      }
      const base = baseRevision ?? row.current_revision ?? 0;
      const rev = await getRevision(jobId, base);
      if (!rev) throw new Error(`Revision ${base} not found`);
      const html = await downloadText(rev.html_path);
      const d = docContextFor(row);

      await setStage(jobId, "writing");
      const edited = await patchOrRewrite(html, { kind: "edit", instruction }, d);

      // The user may have asked for a different length; follow the document.
      const newDuration = declaredDuration(edited.html) ?? d.duration;
      const dNew = { ...d, duration: newDuration };

      await setStage(jobId, "validating");
      const repaired = await repairUntilValid(edited.html, dNew);
      if (hasBlockingErrors(repaired.report)) {
        throw new Error(
          `The edited video did not pass validation: ${repaired.report.errors.map((e) => e.message).slice(0, 3).join("; ")}`,
        );
      }

      const revision = await nextRevisionNumber(jobId);
      await saveRevision({
        jobId,
        revision,
        kind: "edit",
        instruction: `${instruction}${edited.summary ? `\n— ${edited.summary}` : ""}`.slice(0, 2000),
        html: repaired.html,
        thumbJpeg: pickThumbFrame(repaired.report.frames),
      });
      const planRecord = row.studio_plan;
      await setStage(jobId, "preview_ready", {
        current_revision: revision,
        error: null,
        ...(planRecord && newDuration !== d.duration
          ? { studio_plan: { ...planRecord, finalDuration: newDuration } }
          : {}),
      });
      capture(row, "studio_edit_completed", { revision, mode: edited.mode, repair_rounds: repaired.rounds });
      return revision;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[studio ${jobId}] edit failed:`, message);
      await setStage(jobId, restoreStage, { error: `Edit failed: ${message}` }).catch(() => {});
      capture(row, "studio_edit_failed", { error: message.slice(0, 300) });
      return null;
    }
  });
}

export function capture(
  row: Pick<StudioJobRow, "id" | "user_id">,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  if (!row.user_id) return;
  try {
    getPostHog().capture({ distinctId: row.user_id, event, properties: { job_id: row.id, ...properties } });
  } catch {
    // telemetry never breaks a job
  }
}


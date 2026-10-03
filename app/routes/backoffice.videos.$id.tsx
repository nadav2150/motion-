// GET /backoffice/videos/:id — one video's USD cost: totals by provider and
// every metered call behind it (Opus steps, voiceover, Gemini, images, render).

import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/backoffice.videos.$id";
import { requireAdminOrRedirect } from "../lib/admin";
import { COST_CATEGORIES, costCategory, fmtUsd, loadJobCostDetail, type CostCall, type JobCost } from "../lib/admin-costs";
import { getSupabase } from "../lib/supabase";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Backoffice — Video cost" }, { name: "robots", content: "noindex" }];
}

type Job = {
  id: string;
  user_id: string | null;
  title: string | null;
  prompt: string | null;
  status: string;
  created_at: string;
  deleted_at: string | null;
  final_video_duration: number | null;
  target_duration: number | null;
  voice_id: string | null;
  voiceover_enabled: boolean | null;
  music_enabled: boolean | null;
  audio: { music?: { title?: string; artist?: string | null } | null; voiceover?: { duration?: number } | null } | null;
  final_video_url: string | null;
};

type LoaderData = { job: Job; email: string | null; cost: JobCost; calls: CostCall[] };

export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdminOrRedirect(request);
  const db = getSupabase();
  const { data: job, error } = await db
    .from("jobs")
    .select(
      "id, user_id, title, prompt, status, created_at, deleted_at, final_video_duration, target_duration, voice_id, voiceover_enabled, music_enabled, audio, final_video_url",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw new Response(`Failed to load job: ${error.message}`, { status: 500, headers });
  if (!job) throw new Response("Video not found", { status: 404, headers });
  const j = job as Job;

  const [{ cost, calls }, user] = await Promise.all([
    loadJobCostDetail(j.id),
    j.user_id ? db.auth.admin.getUserById(j.user_id) : null,
  ]);
  return data({ job: j, email: user?.data.user?.email ?? null, cost, calls } satisfies LoaderData, { headers });
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

// "opus_studio_scene" → "studio scene"
function stepLabel(reason: string): string {
  return reason.replace(/^opus_/, "").replace(/_/g, " ");
}

function usageLabel(c: CostCall): string {
  const m = c.meta ?? {};
  if (c.provider === "anthropic" || c.provider === "google_gemini") {
    const parts = [`in ${Number(m.input_tokens ?? 0).toLocaleString()}`, `out ${Number(m.output_tokens ?? 0).toLocaleString()}`];
    if (m.cache_read) parts.push(`cache read ${Number(m.cache_read).toLocaleString()}`);
    return parts.join(" · ") + " tok";
  }
  if (c.provider === "videly_render") {
    return `${c.units ?? 0}s video` + (m.wall_seconds != null ? ` · ${m.wall_seconds}s compute` : "");
  }
  if (c.units != null) return `${c.units.toLocaleString()} ${c.unit_kind ?? ""}`.trim();
  return "—";
}

export default function BackofficeVideoCost() {
  const { job, email, cost, calls } = useLoaderData() as LoaderData;
  const length = job.final_video_duration ?? job.target_duration;
  const music = job.audio?.music;
  const metered = calls.filter((c) => c.provider);

  return (
    <main style={S.page}>
      <div style={S.container}>
        <Link to="/backoffice/videos" style={S.back}>← All videos</Link>

        <header style={S.head}>
          <div>
            <h1 style={S.h1}>{job.title ?? "Untitled"}{job.deleted_at ? " (deleted)" : ""}</h1>
            <p style={S.sub}>
              {job.user_id ? <Link to={`/backoffice/users/${job.user_id}`} style={S.link}>{email ?? job.user_id}</Link> : "No user"}
              {" · "}{job.status.replace(/_/g, " ")} · {fmt(job.created_at)}
              {job.final_video_url && <> · <a href={job.final_video_url} target="_blank" rel="noreferrer" style={S.link}>Watch MP4</a></>}
            </p>
          </div>
          <div style={S.totalBox}>
            <div style={S.k}>Total cost</div>
            <div style={S.total}>{fmtUsd(cost.totalMicros)}</div>
            <div style={S.k}>
              {cost.creditsUsed.toLocaleString()} credits used
              {length ? ` · ${fmtUsd(cost.totalMicros / length)}/s of video` : ""}
            </div>
          </div>
        </header>

        <div style={S.grid}>
          {COST_CATEGORIES.map((c) => (
            <div key={c.key} style={S.card}>
              <div style={S.k}>{c.label}</div>
              <div style={S.catValue}>{fmtUsd(cost.byCategory[c.key])}</div>
              <div style={S.k}>
                {c.key === "music" ? (music?.title ? `${music.title}${music.artist ? ` — ${music.artist}` : ""} (Jamendo, free)` : job.music_enabled === false ? "Music off" : "No track")
                  : c.key === "voice" ? (job.audio?.voiceover ? `${Math.round(job.audio.voiceover.duration ?? 0)}s voiceover` : job.voiceover_enabled === false ? "Voiceover off" : "No voiceover")
                  : `${metered.filter((m) => costCategory(m.provider) === c.key).length} calls`}
              </div>
            </div>
          ))}
        </div>

        {job.prompt && (
          <section style={S.card}>
            <div style={S.k}>Prompt</div>
            <p style={S.prompt}>{job.prompt}</p>
          </section>
        )}

        <section style={{ ...S.card, marginTop: 16 }}>
          <h2 style={S.cardTitle}>Metered calls ({metered.length})</h2>
          {metered.length === 0 ? <p style={S.muted}>No metered calls recorded for this video.</p> : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Time</th>
                  <th style={S.th}>Step</th>
                  <th style={S.th}>Provider / model</th>
                  <th style={S.th}>Usage</th>
                  <th style={S.thR}>Cost</th>
                  <th style={S.thR}>Credits</th>
                </tr>
              </thead>
              <tbody>
                {metered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...S.td, color: "#8A8F98" }}>{new Date(c.created_at).toLocaleTimeString()}</td>
                    <td style={S.td}>{stepLabel(c.reason)}</td>
                    <td style={S.td}>{c.provider} <span style={S.muted}>{c.model}</span></td>
                    <td style={{ ...S.td, color: "#8A8F98" }}>{usageLabel(c)}</td>
                    <td style={S.tdR}>{fmtUsd(c.cost_usd_micros)}{c.creditPriced ? "*" : ""}</td>
                    <td style={S.tdR}>{c.credits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cost.hasCreditPricedRender && (
            <p style={{ ...S.muted, marginTop: 10, fontSize: 12 }}>
              * Rendered before Oct 3 2026: recorded at the credit price ($0.005 per video second), not the real compute time.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#06070A", color: "#E6E8EC", padding: "40px 32px", fontFamily: "Inter, system-ui, sans-serif" },
  container: { maxWidth: 1100, margin: "0 auto" },
  back: { color: "#7AA2FF", textDecoration: "none", fontSize: 14 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, margin: "16px 0 24px", flexWrap: "wrap" },
  h1: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  sub: { color: "#8A8F98", margin: "6px 0 0", fontSize: 13, textTransform: "capitalize" },
  link: { color: "#7AA2FF", textDecoration: "none", textTransform: "none" },
  totalBox: { textAlign: "right" },
  total: { fontSize: 32, fontWeight: 800, fontVariantNumeric: "tabular-nums", margin: "2px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 },
  card: { background: "#0C0E12", border: "1px solid #1B1E26", borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#8A8F98", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" },
  catValue: { fontSize: 20, fontWeight: 700, margin: "4px 0", fontVariantNumeric: "tabular-nums" },
  k: { color: "#8A8F98", fontSize: 12 },
  prompt: { margin: "6px 0 0", fontSize: 14, color: "#D4D7DD", whiteSpace: "pre-wrap" },
  muted: { color: "#8A8F98", fontSize: 13, margin: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", color: "#8A8F98", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  thR: { textAlign: "right", padding: "8px 10px", color: "#8A8F98", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  td: { padding: "8px 10px", borderBottom: "1px solid #14161C", textAlign: "left" },
  tdR: { padding: "8px 10px", borderBottom: "1px solid #14161C", textAlign: "right", fontVariantNumeric: "tabular-nums" },
};

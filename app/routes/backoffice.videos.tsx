// GET /backoffice/videos — every video (job) with what it cost us in USD,
// split by provider: Claude, ElevenLabs, music, Gemini, images, render.
// ?user=<id> narrows to one user. Rows link to the per-call breakdown.

import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/backoffice.videos";
import { requireAdminOrRedirect } from "../lib/admin";
import { COST_CATEGORIES, fmtUsd, loadJobCosts, type JobCost } from "../lib/admin-costs";
import { getSupabase } from "../lib/supabase";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Backoffice — Video costs" }, { name: "robots", content: "noindex" }];
}

const PAGE_SIZE = 50;

type JobRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  status: string;
  created_at: string;
  deleted_at: string | null;
  final_video_duration: number | null;
  target_duration: number | null;
  voiceover_enabled: boolean | null;
  music_enabled: boolean | null;
  audio: { music?: { title?: string } | null; voiceover?: unknown } | null;
};

type VideoRow = JobRow & { email: string | null; cost: JobCost };

type LoaderData = {
  rows: VideoRow[];
  total: number;
  page: number;
  userId: string | null;
  userEmail: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdminOrRedirect(request);
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const userId = url.searchParams.get("user") || null;

  const db = getSupabase();
  let query = db
    .from("jobs")
    .select(
      "id, user_id, title, status, created_at, deleted_at, final_video_duration, target_duration, voiceover_enabled, music_enabled, audio",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (userId) query = query.eq("user_id", userId);
  const { data: jobs, error, count } = await query;
  if (error) throw new Response(`Failed to load jobs: ${error.message}`, { status: 500, headers });

  const list = (jobs ?? []) as JobRow[];
  const userIds = [...new Set(list.map((j) => j.user_id).filter((id): id is string => !!id))];
  const [costs, users] = await Promise.all([
    loadJobCosts(list.map((j) => j.id)),
    Promise.all(userIds.map((id) => db.auth.admin.getUserById(id))),
  ]);
  const emails: Record<string, string | null> = {};
  userIds.forEach((id, i) => (emails[id] = users[i]?.data.user?.email ?? null));

  const rows = list.map((j) => ({ ...j, email: j.user_id ? emails[j.user_id] ?? null : null, cost: costs[j.id]! }));
  return data(
    {
      rows,
      total: count ?? rows.length,
      page,
      userId,
      userEmail: userId ? emails[userId] ?? null : null,
    } satisfies LoaderData,
    { headers },
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
}

function musicLabel(j: JobRow): string {
  if (j.audio?.music?.title) return j.audio.music.title;
  return j.music_enabled === false ? "off" : "—";
}

export default function BackofficeVideos() {
  const { rows, total, page, userId, userEmail } = useLoaderData() as LoaderData;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const withCost = rows.filter((r) => r.cost.totalMicros > 0);
  const pageTotal = withCost.reduce((s, r) => s + r.cost.totalMicros, 0);
  const finished = withCost.filter((r) => r.final_video_duration);
  const avgFinished = finished.length ? finished.reduce((s, r) => s + r.cost.totalMicros, 0) / finished.length : 0;
  const categoryTotals = COST_CATEGORIES.map((c) => ({
    ...c,
    micros: withCost.reduce((s, r) => s + r.cost.byCategory[c.key], 0),
  }));
  const anyCreditPriced = rows.some((r) => r.cost.hasCreditPricedRender);

  return (
    <main style={S.page}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Video costs{userId ? ` — ${userEmail ?? userId}` : ""}</h1>
          <p style={S.sub}>
            {total} videos · <Link to="/backoffice" style={S.link}>← Users</Link>
            {userId && <> · <Link to="/backoffice/videos" style={S.link}>All videos</Link></>}
          </p>
        </div>
      </header>

      <section style={S.summary}>
        <Stat label="Spend (this page)" value={fmtUsd(pageTotal)} />
        <Stat label="Avg per finished video" value={finished.length ? fmtUsd(avgFinished) : "—"} hint={`${finished.length} finished`} />
        {categoryTotals.filter((c) => c.micros > 0).map((c) => (
          <Stat key={c.key} label={c.label} value={fmtUsd(c.micros)} hint={pageTotal ? `${Math.round((c.micros / pageTotal) * 100)}%` : undefined} />
        ))}
      </section>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Video</th>
              <th style={S.th}>User</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Created</th>
              <th style={S.thR}>Length</th>
              <th style={S.th}>Music track</th>
              {COST_CATEGORIES.map((c) => <th key={c.key} style={S.thR}>{c.label}</th>)}
              <th style={S.thR}>Total</th>
              <th style={S.thR}>Credits used</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8 + COST_CATEGORIES.length} style={S.empty}>No videos.</td></tr>
            )}
            {rows.map((r) => {
              const length = r.final_video_duration ?? r.target_duration;
              return (
                <tr key={r.id} style={S.tr}>
                  <td style={S.td}>
                    <Link to={`/backoffice/videos/${r.id}`} style={S.link}>{r.title ?? "Untitled"}</Link>
                    {r.deleted_at && <span style={S.muted}> (deleted)</span>}
                  </td>
                  <td style={S.td}>
                    {r.user_id ? <Link to={`/backoffice/users/${r.user_id}`} style={S.plainLink}>{r.email ?? r.user_id.slice(0, 8)}</Link> : "—"}
                  </td>
                  <td style={S.td}><span style={S.tag}>{r.status.replace(/_/g, " ")}</span></td>
                  <td style={S.td}>{fmtDate(r.created_at)}</td>
                  <td style={S.tdR}>{length ? `${Math.round(length)}s` : "—"}</td>
                  <td style={{ ...S.td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={musicLabel(r)}>{musicLabel(r)}</td>
                  {COST_CATEGORIES.map((c) => (
                    <td key={c.key} style={{ ...S.tdR, color: r.cost.byCategory[c.key] ? "#D4D7DD" : "#4A4F58" }}>
                      {r.cost.byCategory[c.key] ? fmtUsd(r.cost.byCategory[c.key]) : "—"}
                      {c.key === "render" && r.cost.hasCreditPricedRender ? "*" : ""}
                    </td>
                  ))}
                  <td style={{ ...S.tdR, fontWeight: 700, color: "#E6E8EC" }}>{r.cost.calls ? fmtUsd(r.cost.totalMicros) : "—"}</td>
                  <td style={S.tdR}>{r.cost.creditsUsed ? r.cost.creditsUsed.toLocaleString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={S.note}>
        Costs are what Videly pays upstream, summed from metered calls. Music comes from Jamendo (free).
        Render = container time (standard-2, ~$0.036/min).
        {anyCreditPriced && " * Render recorded before Oct 3 2026 at its credit price ($0.005 per video second), which overstates the real compute."}
      </p>

      <nav style={S.pager}>
        <PageLink userId={userId} page={page - 1} disabled={page <= 1} label="← Prev" />
        <span style={S.pageInfo}>Page {page} of {pages}</span>
        <PageLink userId={userId} page={page + 1} disabled={page >= pages} label="Next →" />
      </nav>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
      {hint && <div style={S.statHint}>{hint}</div>}
    </div>
  );
}

function PageLink({ userId, page, disabled, label }: { userId: string | null; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span style={{ ...S.btn, opacity: 0.4 }}>{label}</span>;
  const params = new URLSearchParams();
  if (userId) params.set("user", userId);
  params.set("page", String(page));
  return <Link to={`/backoffice/videos?${params}`} style={S.btn}>{label}</Link>;
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#06070A", color: "#E6E8EC", padding: "40px 32px", fontFamily: "Inter, system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, maxWidth: 1800, margin: "0 auto 20px", flexWrap: "wrap" },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  sub: { color: "#8A8F98", margin: "4px 0 0", fontSize: 13 },
  summary: { maxWidth: 1800, margin: "0 auto 20px", display: "flex", gap: 12, flexWrap: "wrap" },
  stat: { background: "#0C0E12", border: "1px solid #1B1E26", borderRadius: 12, padding: "12px 16px", minWidth: 150 },
  statLabel: { color: "#8A8F98", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 },
  statValue: { fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" },
  statHint: { color: "#8A8F98", fontSize: 12, marginTop: 2 },
  btn: { background: "#1A1D24", border: "1px solid #2A2E37", borderRadius: 8, padding: "8px 14px", color: "#E6E8EC", fontSize: 14, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  tableWrap: { maxWidth: 1800, margin: "0 auto", overflowX: "auto", border: "1px solid #1B1E26", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26", whiteSpace: "nowrap" },
  thR: { textAlign: "right", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #14161C" },
  td: { padding: "12px 14px", color: "#D4D7DD", whiteSpace: "nowrap" },
  tdR: { padding: "12px 14px", color: "#D4D7DD", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  tag: { background: "#16191F", border: "1px solid #262A33", borderRadius: 999, padding: "2px 10px", fontSize: 12, textTransform: "capitalize" },
  link: { color: "#7AA2FF", textDecoration: "none", fontWeight: 600 },
  plainLink: { color: "#D4D7DD", textDecoration: "none" },
  muted: { color: "#8A8F98", fontSize: 12 },
  empty: { padding: "32px", textAlign: "center", color: "#8A8F98" },
  note: { maxWidth: 1800, margin: "14px auto 0", color: "#8A8F98", fontSize: 12, lineHeight: 1.5 },
  pager: { maxWidth: 1800, margin: "20px auto 0", display: "flex", alignItems: "center", gap: 16, justifyContent: "center" },
  pageInfo: { color: "#8A8F98", fontSize: 13 },
};

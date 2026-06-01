// GET /backoffice/users/:id — full detail for one user (identity, billing,
// subscriptions, usage, recent jobs, credit ledger) + Impersonate button.

import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/backoffice.users.$id";
import { requireAdminOrRedirect } from "../lib/admin";
import { getSupabase } from "../lib/supabase";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Backoffice — User" }, { name: "robots", content: "noindex" }];
}

type Detail = {
  identity: {
    user_id: string;
    email: string | null;
    name: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  } | null;
  billing: {
    plan_tier: string;
    credits_balance: number;
    credits_reserved: number;
    monthly_grant: number;
    period_end: string | null;
    provider_customer_id: string | null;
  } | null;
  subscriptions: Array<{ provider_subscription_id: string; plan_tier: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean }>;
  usage: { job_count: number; last_job_at: string | null };
  recent_jobs: Array<{ id: string; title: string | null; status: string; created_at: string }>;
  ledger: Array<{ id: string; delta: number; kind: string; reason: string; created_at: string }>;
};

type LoaderData = { detail: Detail; userId: string };

export async function loader({ request, params }: Route.LoaderArgs) {
  const { headers } = await requireAdminOrRedirect(request);
  const userId = params.id;

  const db = getSupabase();
  const { data: detail, error } = await db.rpc("admin_get_user", { p_user_id: userId });
  if (error) {
    console.error(`[backoffice] admin_get_user(${userId}) failed: ${error.message}`);
    throw new Response(`Failed to load user: ${error.message}`, { status: 500, headers });
  }
  if (!detail || !(detail as Detail).identity) {
    throw new Response("User not found", { status: 404, headers });
  }
  return data({ detail: detail as Detail, userId } satisfies LoaderData, { headers });
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

export default function BackofficeUserDetail() {
  const { detail, userId } = useLoaderData() as LoaderData;
  const id = detail.identity!;
  const b = detail.billing;

  return (
    <main style={S.page}>
      <div style={S.container}>
        <Link to="/backoffice" style={S.back}>← All users</Link>

        <header style={S.head}>
          <div>
            <h1 style={S.h1}>{id.email ?? "(no email)"}</h1>
            <p style={S.sub}>{id.name ?? "No name"} · <code style={S.code}>{id.user_id}</code></p>
          </div>
          {/* reloadDocument → native document POST (not a client .data fetch),
              so the action's auto-submitting handoff HTML reaches the browser. */}
          <Form method="post" action="/api/backoffice/impersonate" reloadDocument>
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="email" value={id.email ?? ""} />
            <button type="submit" style={S.impBtn}>Impersonate →</button>
          </Form>
        </header>

        <div style={S.grid}>
          <Card title="Identity">
            <Row k="Joined" v={fmt(id.created_at)} />
            <Row k="Last sign-in" v={fmt(id.last_sign_in_at)} />
            <Row k="Email confirmed" v={fmt(id.email_confirmed_at)} />
          </Card>

          <Card title="Billing">
            {b ? (
              <>
                <Row k="Plan" v={b.plan_tier} />
                <Row k="Credits balance" v={b.credits_balance.toLocaleString()} />
                <Row k="Credits reserved" v={b.credits_reserved.toLocaleString()} />
                <Row k="Monthly grant" v={b.monthly_grant.toLocaleString()} />
                <Row k="Period end" v={fmt(b.period_end)} />
                <Row k="Polar customer" v={b.provider_customer_id ?? "—"} />
              </>
            ) : <p style={S.muted}>No billing row.</p>}
          </Card>

          <Card title="Usage">
            <Row k="Total jobs" v={String(detail.usage.job_count)} />
            <Row k="Last job" v={fmt(detail.usage.last_job_at)} />
          </Card>

          <Card title="Subscriptions">
            {detail.subscriptions.length === 0 ? <p style={S.muted}>None.</p> : detail.subscriptions.map((s) => (
              <div key={s.provider_subscription_id} style={S.subRow}>
                <span style={S.tag}>{s.plan_tier}</span>
                <span>{s.status}{s.cancel_at_period_end ? " (canceling)" : ""}</span>
                <span style={S.muted}>ends {fmt(s.current_period_end)}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card title="Recent jobs">
          {detail.recent_jobs.length === 0 ? <p style={S.muted}>No jobs.</p> : (
            <table style={S.miniTable}>
              <tbody>
                {detail.recent_jobs.map((j) => (
                  <tr key={j.id}>
                    <td style={S.mtd}>{j.title ?? "Untitled"}</td>
                    <td style={S.mtd}><span style={S.tag}>{j.status}</span></td>
                    <td style={{ ...S.mtd, color: "#8A8F98" }}>{fmt(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Credit ledger (recent)">
          {detail.ledger.length === 0 ? <p style={S.muted}>No ledger entries.</p> : (
            <table style={S.miniTable}>
              <tbody>
                {detail.ledger.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...S.mtd, color: l.delta >= 0 ? "#5BD18C" : "#FF7A85", fontVariantNumeric: "tabular-nums" }}>
                      {l.delta >= 0 ? "+" : ""}{l.delta.toLocaleString()}
                    </td>
                    <td style={S.mtd}>{l.kind}</td>
                    <td style={S.mtd}>{l.reason}</td>
                    <td style={{ ...S.mtd, color: "#8A8F98" }}>{fmt(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={S.card}>
      <h2 style={S.cardTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={S.kv}>
      <span style={S.k}>{k}</span>
      <span style={S.v}>{v}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#06070A", color: "#E6E8EC", padding: "40px 32px", fontFamily: "Inter, system-ui, sans-serif" },
  container: { maxWidth: 1000, margin: "0 auto" },
  back: { color: "#7AA2FF", textDecoration: "none", fontSize: 14 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, margin: "16px 0 28px", flexWrap: "wrap" },
  h1: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  sub: { color: "#8A8F98", margin: "6px 0 0", fontSize: 13 },
  code: { background: "#0E1014", padding: "2px 6px", borderRadius: 5, fontSize: 12 },
  impBtn: { background: "#7AA2FF", border: "none", borderRadius: 8, padding: "10px 18px", color: "#06070A", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 },
  card: { background: "#0C0E12", border: "1px solid #1B1E26", borderRadius: 12, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#8A8F98", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 12px" },
  kv: { display: "flex", justifyContent: "space-between", gap: 16, padding: "5px 0", fontSize: 14 },
  k: { color: "#8A8F98" },
  v: { color: "#E6E8EC", textAlign: "right" },
  muted: { color: "#8A8F98", fontSize: 14, margin: 0 },
  tag: { background: "#16191F", border: "1px solid #262A33", borderRadius: 999, padding: "2px 10px", fontSize: 12, textTransform: "capitalize" },
  subRow: { display: "flex", gap: 12, alignItems: "center", padding: "6px 0", fontSize: 14 },
  miniTable: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  mtd: { padding: "8px 10px", borderBottom: "1px solid #14161C", textAlign: "left" },
};

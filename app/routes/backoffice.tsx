// GET /backoffice — admin user roster. Searchable + paginated. Admin-gated by
// ADMIN_EMAILS (see app/lib/admin.ts). Rows link to the per-user detail page.

import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/backoffice";
import { requireAdminOrRedirect } from "../lib/admin";
import { getSupabase } from "../lib/supabase";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Backoffice — Users" }, { name: "robots", content: "noindex" }];
}

const PAGE_SIZE = 25;

type UserRow = {
  user_id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  plan_tier: string;
  credits_balance: number;
  credits_reserved: number;
  job_count: number;
  last_job_at: string | null;
  total_count: number;
};

type LoaderData = {
  rows: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  adminEmail: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireAdminOrRedirect(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const db = getSupabase();
  const { data: rows, error } = await db.rpc("admin_list_users", {
    p_search: q || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) {
    console.error(`[backoffice] admin_list_users failed: ${error.message}`);
    throw new Response(`Failed to load users: ${error.message}`, { status: 500, headers });
  }

  const list = (rows ?? []) as UserRow[];
  const total = list[0]?.total_count ?? 0;
  return data(
    { rows: list, total, page, pageSize: PAGE_SIZE, q, adminEmail: user.email } satisfies LoaderData,
    { headers },
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "—";
}

export default function BackofficeUsers() {
  const { rows, total, page, pageSize, q, adminEmail } = useLoaderData() as LoaderData;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main style={S.page}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Users</h1>
          <p style={S.sub}>{total} total · signed in as {adminEmail}</p>
        </div>
        <Form method="get" style={S.searchForm}>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search email or name…"
            style={S.search}
            autoComplete="off"
          />
          <button type="submit" style={S.btn}>Search</button>
        </Form>
      </header>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Email</th>
              <th style={S.th}>Name</th>
              <th style={S.th}>Plan</th>
              <th style={S.thR}>Credits</th>
              <th style={S.thR}>Jobs</th>
              <th style={S.th}>Joined</th>
              <th style={S.th}>Last seen</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={S.empty}>No users found.</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.user_id} style={S.tr}>
                <td style={S.td}>{u.email}</td>
                <td style={S.td}>{u.name ?? "—"}</td>
                <td style={S.td}><span style={S.tag}>{u.plan_tier}</span></td>
                <td style={S.tdR}>{u.credits_balance.toLocaleString()}</td>
                <td style={S.tdR}>{u.job_count}</td>
                <td style={S.td}>{fmtDate(u.created_at)}</td>
                <td style={S.td}>{fmtDate(u.last_sign_in_at)}</td>
                <td style={S.tdR}>
                  <Link to={`/backoffice/users/${u.user_id}`} style={S.link}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav style={S.pager}>
        <PageLink q={q} page={page - 1} disabled={page <= 1} label="← Prev" />
        <span style={S.pageInfo}>Page {page} of {pages}</span>
        <PageLink q={q} page={page + 1} disabled={page >= pages} label="Next →" />
      </nav>
    </main>
  );
}

function PageLink({ q, page, disabled, label }: { q: string; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span style={{ ...S.btn, opacity: 0.4 }}>{label}</span>;
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));
  return <Link to={`/backoffice?${params}`} style={S.btn}>{label}</Link>;
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#06070A", color: "#E6E8EC", padding: "40px 32px", fontFamily: "Inter, system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, maxWidth: 1200, margin: "0 auto 24px", flexWrap: "wrap" },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  sub: { color: "#8A8F98", margin: "4px 0 0", fontSize: 13 },
  searchForm: { display: "flex", gap: 8 },
  search: { background: "#0E1014", border: "1px solid #23262E", borderRadius: 8, padding: "8px 12px", color: "#E6E8EC", fontSize: 14, minWidth: 240 },
  btn: { background: "#1A1D24", border: "1px solid #2A2E37", borderRadius: 8, padding: "8px 14px", color: "#E6E8EC", fontSize: 14, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  tableWrap: { maxWidth: 1200, margin: "0 auto", overflowX: "auto", border: "1px solid #1B1E26", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  thR: { textAlign: "right", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  tr: { borderBottom: "1px solid #14161C" },
  td: { padding: "12px 14px", color: "#D4D7DD" },
  tdR: { padding: "12px 14px", color: "#D4D7DD", textAlign: "right" },
  tag: { background: "#16191F", border: "1px solid #262A33", borderRadius: 999, padding: "2px 10px", fontSize: 12, textTransform: "capitalize" },
  link: { color: "#7AA2FF", textDecoration: "none", fontWeight: 600 },
  empty: { padding: "32px", textAlign: "center", color: "#8A8F98" },
  pager: { maxWidth: 1200, margin: "20px auto 0", display: "flex", alignItems: "center", gap: 16, justifyContent: "center" },
  pageInfo: { color: "#8A8F98", fontSize: 13 },
};

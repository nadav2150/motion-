// GET/POST /backoffice/share — public share links (/v/:slug). Upload a finished
// MP4 (made anywhere) and get a no-login link to paste e.g. in a Reddit reply.
// Links made from Studio projects (the "Share link" button on /videos/:id)
// show up here too. Admin-gated by ADMIN_EMAILS (see app/lib/admin.ts).

import { useState } from "react";
import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/backoffice.share";
import { requireAdminApi, requireAdminOrRedirect } from "../lib/admin";
import { uploadBuffer } from "../lib/storage";
import {
  createSharedVideo,
  listSharedVideos,
  setSharedVideoDisabled,
  shareUrl,
  uniqueSlug,
  type SharedVideoRow,
} from "../lib/share";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Backoffice — Share links" }, { name: "robots", content: "noindex" }];
}

type Row = SharedVideoRow & { url: string };
type LoaderData = { rows: Row[] };
type ActionData = { ok: true; url?: string } | { ok: false; error: string };

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdminOrRedirect(request);
  const rows = (await listSharedVideos()).map((r) => ({ ...r, url: shareUrl(r.slug) }));
  return data({ rows } satisfies LoaderData, { headers });
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function action({ request }: Route.ActionArgs) {
  const { user, headers } = await requireAdminApi(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "toggle") {
    const id = String(form.get("id") ?? "");
    await setSharedVideoDisabled(id, form.get("disabled") === "1");
    return data({ ok: true } satisfies ActionData, { headers });
  }

  const title = String(form.get("title") ?? "").trim();
  const recipient = String(form.get("recipient") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const slugInput = String(form.get("slug") ?? "").trim();
  const video = form.get("video");
  const thumb = form.get("thumb");

  if (!title) return data({ ok: false, error: "Title is required" } satisfies ActionData, { headers });
  if (!(video instanceof File) || video.size === 0) {
    return data({ ok: false, error: "Choose an MP4 file" } satisfies ActionData, { headers });
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return data({ ok: false, error: "Video is over 100 MB" } satisfies ActionData, { headers });
  }

  try {
    const slug = await uniqueSlug(slugInput || recipient || title);
    const dir = `share/${slug}`;
    const uploaded = await uploadBuffer({
      storagePath: `${dir}/video.mp4`,
      body: Buffer.from(await video.arrayBuffer()),
      contentType: video.type || "video/mp4",
    });
    let thumbPath: string | null = null;
    if (thumb instanceof File && thumb.size > 0) {
      const ext = thumb.type === "image/png" ? "png" : thumb.type === "image/webp" ? "webp" : "jpg";
      thumbPath = (
        await uploadBuffer({
          storagePath: `${dir}/thumb.${ext}`,
          body: Buffer.from(await thumb.arrayBuffer()),
          contentType: thumb.type || "image/jpeg",
        })
      ).storagePath;
    }
    const row = await createSharedVideo({
      title,
      recipient,
      message,
      slug,
      videoPath: uploaded.storagePath,
      thumbPath,
      createdBy: user.id,
    });
    return data({ ok: true, url: shareUrl(row.slug) } satisfies ActionData, { headers });
  } catch (err) {
    console.error(`[backoffice/share] create failed:`, err);
    return data({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ActionData, { headers });
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      style={S.btn}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export default function BackofficeShare() {
  const { rows } = useLoaderData() as LoaderData;
  const result = useActionData() as ActionData | undefined;
  const nav = useNavigation();
  const uploading = nav.state === "submitting" && nav.formData?.get("intent") === "create";

  return (
    <main style={S.page}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Share links</h1>
          <p style={S.sub}>
            Public no-login pages at videly.io/v/… — watch, download, and an upsell to sign up.{" "}
            <Link to="/backoffice" style={S.link}>← Users</Link>
          </p>
        </div>
      </header>

      <section style={S.card}>
        <h2 style={S.h2}>New link from an MP4</h2>
        <p style={S.sub}>For a Studio project, use the “Share link” button on the video page instead.</p>
        <Form method="post" encType="multipart/form-data" style={S.form}>
          <input type="hidden" name="intent" value="create" />
          <label style={S.label}>
            Title*
            <input name="title" required placeholder="Deep Focus — launch video" style={S.input} />
          </label>
          <label style={S.label}>
            Made for (product or Reddit user)
            <input name="recipient" placeholder="Deep Focus" style={S.input} />
          </label>
          <label style={S.label}>
            Custom slug (optional)
            <input name="slug" placeholder="deep-focus" style={S.input} />
          </label>
          <label style={{ ...S.label, gridColumn: "1 / -1" }}>
            Personal note (optional)
            <textarea name="message" rows={2} placeholder="Here's your video! Would love your honest feedback in the thread 🙏" style={S.input} />
          </label>
          <label style={S.label}>
            MP4 video* (max 100 MB)
            <input name="video" type="file" accept="video/mp4,video/quicktime,video/webm" required style={S.input} />
          </label>
          <label style={S.label}>
            Thumbnail (optional, for link previews)
            <input name="thumb" type="file" accept="image/png,image/jpeg,image/webp" style={S.input} />
          </label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" style={S.primary} disabled={uploading}>
              {uploading ? "Uploading…" : "Create link"}
            </button>
            {result?.ok === false && <span style={{ color: "#FF8A8A" }}>{result.error}</span>}
            {result?.ok && result.url && (
              <>
                <code style={S.code}>{result.url}</code>
                <CopyButton text={result.url} />
              </>
            )}
          </div>
        </Form>
      </section>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Title</th>
              <th style={S.th}>For</th>
              <th style={S.th}>Source</th>
              <th style={S.thR}>Views</th>
              <th style={S.thR}>Downloads</th>
              <th style={S.th}>Created</th>
              <th style={S.th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={S.empty}>No share links yet.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ ...S.tr, opacity: r.disabled_at ? 0.45 : 1 }}>
                <td style={S.td}>
                  <a href={`/v/${r.slug}`} target="_blank" rel="noreferrer" style={S.link}>{r.title}</a>
                  <div style={S.sub}>/v/{r.slug}</div>
                </td>
                <td style={S.td}>{r.recipient ?? "—"}</td>
                <td style={S.td}>{r.job_id ? <Link to={`/videos/${r.job_id}`} style={S.link}>Studio</Link> : "Upload"}</td>
                <td style={S.tdR}>{r.views}</td>
                <td style={S.tdR}>{r.downloads}</td>
                <td style={S.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={{ ...S.td, display: "flex", gap: 8 }}>
                  <CopyButton text={r.url} />
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="disabled" value={r.disabled_at ? "0" : "1"} />
                    <button type="submit" style={S.btn}>{r.disabled_at ? "Enable" : "Disable"}</button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#06070A", color: "#E6E8EC", padding: "40px 32px", fontFamily: "Inter, system-ui, sans-serif" },
  header: { maxWidth: 1200, margin: "0 auto 24px" },
  h1: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  h2: { fontSize: 18, fontWeight: 600, margin: 0 },
  sub: { color: "#8A8F98", margin: "4px 0 0", fontSize: 13 },
  card: { maxWidth: 1200, margin: "0 auto 24px", border: "1px solid #1B1E26", borderRadius: 12, padding: 20, background: "#0A0C10" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 16 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#B4B8C0" },
  input: { background: "#0E1014", border: "1px solid #23262E", borderRadius: 8, padding: "8px 12px", color: "#E6E8EC", fontSize: 14, fontFamily: "inherit" },
  btn: { background: "#1A1D24", border: "1px solid #2A2E37", borderRadius: 8, padding: "6px 12px", color: "#E6E8EC", fontSize: 13, cursor: "pointer" },
  primary: { background: "#ef8354", border: "none", borderRadius: 8, padding: "10px 18px", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  code: { background: "#0E1014", border: "1px solid #23262E", borderRadius: 6, padding: "6px 10px", fontSize: 12 },
  tableWrap: { maxWidth: 1200, margin: "0 auto", overflowX: "auto", border: "1px solid #1B1E26", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  thR: { textAlign: "right", padding: "12px 14px", color: "#8A8F98", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #1B1E26" },
  tr: { borderBottom: "1px solid #14161C" },
  td: { padding: "12px 14px", color: "#D4D7DD", whiteSpace: "nowrap", verticalAlign: "top" },
  tdR: { padding: "12px 14px", color: "#D4D7DD", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" },
  link: { color: "#7AA2FF", textDecoration: "none", fontWeight: 600 },
  empty: { padding: "32px", textAlign: "center", color: "#8A8F98" },
};

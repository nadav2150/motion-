// /assets — the user's uploads, voiceovers and reference videos.

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, EllipsisVertical, ExternalLink, FolderOpen, Loader2, Play, Plus, Trash2, Upload } from "lucide-react";
import type { UserAsset } from "../../lib/studio/types";
import { api } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button, focusRing } from "../ui/Button";
import { Select, Tabs } from "../ui/controls";
import { EmptyState, PageHeader, Skeleton } from "../ui/Card";
import { ConfirmModal } from "../ui/Modal";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { cn, formatBytes, formatClock } from "../ui/format";

type Kind = UserAsset["kind"] | "all";
const TABS: { key: Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "video", label: "Videos" },
  { key: "image", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "logo", label: "Logos" },
];
type Sort = "newest" | "oldest" | "name" | "size";

const MAX_UPLOAD_MB = 95;

function Waveform({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 40 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      return 18 + ((h >>> 8) % 70) * (0.55 + 0.45 * Math.sin((i / 40) * Math.PI));
    });
  }, [seed]);
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="none" className="absolute inset-x-6 inset-y-8 h-[calc(100%-4rem)] w-[calc(100%-3rem)]" aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={i * 4} y={50 - b / 2} width="2.2" height={b} rx="1.1" fill={i % 3 === 0 ? "#ef8354" : "#bfc0c0"} opacity={i % 3 === 0 ? 0.95 : 0.55} />
      ))}
    </svg>
  );
}

function AssetTile({ a, onDelete }: { a: UserAsset; onDelete: () => void }) {
  const meta = [a.duration ? formatClock(a.duration) : null, formatBytes(a.bytes)].filter(Boolean).join(" · ");
  return (
    <article className="group min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-slate/40 bg-ink-800">
        {a.kind === "audio" ? (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#2d3142,#262a38)]">
            <Waveform seed={a.id + a.name} />
          </div>
        ) : a.kind === "logo" && !a.url ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#2d3142,#262a38)] text-sm font-semibold text-silver">
            {a.name.split(".").pop()?.toUpperCase()}
          </div>
        ) : a.url ? (
          <img
            src={a.url}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn("absolute inset-0 size-full", a.kind === "logo" ? "object-contain p-6" : "object-cover")}
          />
        ) : null}
        {a.kind === "video" && (
          <span className="absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="size-4 translate-x-[1px] fill-current" aria-hidden />
          </span>
        )}
        {a.kind === "audio" && (
          <span className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-lg bg-black/40 text-coral">
            <AudioLines className="size-4" aria-hidden />
          </span>
        )}
        {a.source !== "upload" && (
          <span className="absolute left-2.5 bottom-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold capitalize text-white">
            {a.source}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-paper" title={a.name}>
            {a.name}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-silver">{meta || "—"}</p>
        </div>
        <Menu
          label={`Actions for ${a.name}`}
          triggerClassName="size-8 shrink-0 rounded-lg text-silver hover:bg-slate/40 hover:text-paper"
          trigger={<EllipsisVertical className="size-4" aria-hidden />}
          items={[
            ...(a.url ? [{ label: "Open", icon: <ExternalLink />, onSelect: () => window.open(a.url, "_blank", "noopener") }] : []),
            { label: "Delete", icon: <Trash2 />, onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </article>
  );
}

export function AssetsScreen({ user, planTier, credits }: { user: ShellUser; planTier: string | null; credits: number | null }) {
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [items, setItems] = useState<UserAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [deleting, setDeleting] = useState<UserAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    api
      .listAssets(kind)
      .then((r) => alive && (setItems(r.items), setError(null)))
      .catch((e) => {
        if (!alive) return;
        setItems([]);
        setError(e instanceof Error ? e.message : "Couldn't load your assets.");
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const sorted = useMemo(() => {
    const xs = [...(items ?? [])];
    if (sort === "newest") xs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "oldest") xs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (sort === "name") xs.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "size") xs.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0));
    return xs;
  }, [items, sort]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await Promise.all(
      Array.from(files).map(async (file, i) => {
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          toast(`${file.name} is larger than ${MAX_UPLOAD_MB} MB`, "error");
          return;
        }
        const id = `u${Date.now()}-${i}`;
        setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
        try {
          const a = await api.uploadAsset(file, (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))));
          if (kind === "all" || kind === a.kind) setItems((xs) => [a, ...(xs ?? [])]);
          toast(`Uploaded ${file.name}`);
        } catch (e) {
          toast(e instanceof Error ? e.message : `Couldn't upload ${file.name}`, "error");
        } finally {
          setUploads((u) => u.filter((x) => x.id !== id));
        }
      }),
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteAsset(deleting.id);
      setItems((xs) => xs?.filter((x) => x.id !== deleting.id) ?? xs);
      toast("Asset deleted");
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally {
      setBusy(false);
    }
  };

  const openPicker = () => input.current?.click();

  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      <PageHeader
        title="Assets"
        subtitle="Manage all your images, videos and other files."
        action={
          <Button icon={<Upload className="size-4" aria-hidden />} onClick={openPicker}>
            Upload
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs label="Asset types" items={TABS} value={kind} onChange={setKind} />
        <Select
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "name", label: "Name A–Z" },
            { value: "size", label: "Largest first" },
          ]}
          className="w-[170px]"
        />
      </div>

      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {items === null ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-video" />
          ))}
        </div>
      ) : sorted.length === 0 && uploads.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="size-5" />}
          title="No files here yet"
          body="Upload images, videos, audio or logos to use them in your videos."
          action={
            <Button icon={<Upload className="size-4" aria-hidden />} onClick={openPicker}>
              Upload
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {uploads.map((u) => (
            <div key={u.id} className="min-w-0" aria-live="polite">
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-coral/50 bg-ink-800 px-4">
                <Loader2 className="size-5 vd-spin text-coral" aria-hidden />
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate/45">
                  <div className="h-full bg-coral" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </div>
              </div>
              <p className="mt-2.5 truncate text-sm font-semibold">{u.name}</p>
              <p className="text-xs text-coral">Uploading · {Math.round(u.progress * 100)}%</p>
            </div>
          ))}
          {sorted.map((a) => (
            <AssetTile key={a.id} a={a} onDelete={() => setDeleting(a)} />
          ))}
          <button
            type="button"
            onClick={openPicker}
            className={cn(
              "flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate/60 text-silver transition-colors hover:border-coral hover:text-coral",
              focusRing,
            )}
          >
            <Plus className="size-6" aria-hidden />
            <span className="text-sm font-semibold">Upload more</span>
          </button>
        </div>
      )}

      <ConfirmModal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        title="Delete this file?"
        body={<>“{deleting?.name}” will be removed. Videos that already use it keep working.</>}
      />
    </AppShell>
  );
}

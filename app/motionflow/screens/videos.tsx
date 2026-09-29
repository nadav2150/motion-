// /videos — My Videos grid with filter tabs, polling while anything generates.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Copy, EllipsisVertical, Film, Pencil, Plus, Star, StarOff, Trash2 } from "lucide-react";
import type { StudioVideoCard } from "../../lib/studio/types";
import { api, GENERATING_STAGES, type VideoFilter } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button, ButtonLink } from "../ui/Button";
import { Tabs, TextField } from "../ui/controls";
import { EmptyState, PageHeader } from "../ui/Card";
import { ConfirmModal, Modal } from "../ui/Modal";
import { Menu } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { VideoCard, VideoCardSkeleton, videoHref } from "../ui/VideoCard";

const TABS: { key: VideoFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "generating", label: "Generating" },
  { key: "ready", label: "Ready" },
  { key: "exports", label: "Exports" },
  { key: "favorites", label: "Favorites" },
];

export function VideosScreen({ user, planTier, credits }: { user: ShellUser; planTier: string | null; credits: number | null }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (TABS.some((t) => t.key === params.get("filter")) ? params.get("filter") : "all") as VideoFilter;
  const q = params.get("q") ?? "";
  const [items, setItems] = useState<StudioVideoCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<StudioVideoCard | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<StudioVideoCard | null>(null);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef<StudioVideoCard[] | null>(null);
  itemsRef.current = items;

  const load = useCallback(async () => {
    try {
      const r = await api.listVideos({ filter, q, limit: 60 });
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your videos.");
      setItems((x) => x ?? []);
    }
  }, [filter, q]);

  useEffect(() => {
    setItems(null);
    void load();
    const t = setInterval(() => {
      if (itemsRef.current?.some((c) => c.stage && (GENERATING_STAGES.has(c.stage) || c.stage === "rendering"))) void load();
    }, 3000);
    return () => clearInterval(t);
  }, [load]);

  const setFilter = (k: VideoFilter) => {
    const p = new URLSearchParams(params);
    if (k === "all") p.delete("filter");
    else p.set("filter", k);
    setParams(p, { replace: true });
  };

  const patch = (id: string, change: Partial<StudioVideoCard>) =>
    setItems((xs) => xs?.map((c) => (c.id === id ? { ...c, ...change } : c)) ?? xs);

  const toggleFavorite = async (c: StudioVideoCard) => {
    patch(c.id, { favorite: !c.favorite });
    try {
      await api.updateVideo(c.id, { favorite: !c.favorite });
      toast(c.favorite ? "Removed from favorites" : "Added to favorites");
      if (filter === "favorites") void load();
    } catch (e) {
      patch(c.id, { favorite: c.favorite });
      toast(e instanceof Error ? e.message : "Couldn't update", "error");
    }
  };

  const duplicate = async (c: StudioVideoCard) => {
    try {
      await api.duplicateVideo(c.id);
      toast("Video duplicated");
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't duplicate", "error");
    }
  };

  const saveRename = async () => {
    if (!renaming) return;
    const title = renameValue.trim() || "Untitled video";
    setBusy(true);
    try {
      await api.updateVideo(renaming.id, { title });
      patch(renaming.id, { title });
      toast("Renamed");
      setRenaming(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't rename", "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteVideo(deleting.id);
      setItems((xs) => xs?.filter((c) => c.id !== deleting.id) ?? xs);
      toast("Video deleted");
      setDeleting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      <PageHeader
        title="My Videos"
        subtitle="All your projects, drafts and generated videos."
        action={
          <ButtonLink to="/home?focus=1" icon={<Plus className="size-4" aria-hidden />}>
            Create new video
          </ButtonLink>
        }
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs label="Filter videos" items={TABS} value={filter} onChange={setFilter} />
        {q && (
          <p className="text-sm text-silver">
            Results for “<span className="text-paper">{q}</span>”{" "}
            <button
              type="button"
              className="ml-1 font-semibold text-coral hover:underline"
              onClick={() => {
                const p = new URLSearchParams(params);
                p.delete("q");
                setParams(p, { replace: true });
              }}
            >
              Clear
            </button>
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {items === null ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Film className="size-5" />}
          title={q ? "No videos match your search" : filter === "all" ? "No videos yet" : `Nothing in ${TABS.find((t) => t.key === filter)?.label}`}
          body={filter === "all" && !q ? "Describe an idea and Videly turns it into a motion video in minutes." : undefined}
          action={
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => navigate("/home?focus=1")}>
              Create new video
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((c, i) => (
            <VideoCard
              key={c.id}
              card={c}
              href={videoHref(c)}
              eager={i < 3}
              menu={
                <Menu
                  label={`Actions for ${c.title}`}
                  triggerClassName="size-8 shrink-0 rounded-lg text-silver hover:bg-slate/40 hover:text-paper"
                  trigger={<EllipsisVertical className="size-4" aria-hidden />}
                  items={[
                    {
                      label: "Rename",
                      icon: <Pencil />,
                      onSelect: () => {
                        setRenameValue(c.title);
                        setRenaming(c);
                      },
                    },
                    {
                      label: c.favorite ? "Unfavorite" : "Favorite",
                      icon: c.favorite ? <StarOff /> : <Star />,
                      onSelect: () => void toggleFavorite(c),
                    },
                    { label: "Duplicate", icon: <Copy />, onSelect: () => void duplicate(c), disabled: c.generationMode !== "v2" },
                    { label: "Delete", icon: <Trash2 />, onSelect: () => setDeleting(c), danger: true },
                  ]}
                />
              }
            />
          ))}
        </div>
      )}

      <Modal open={!!renaming} onClose={() => !busy && setRenaming(null)} title="Rename video">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveRename();
          }}
        >
          <TextField label="Title" value={renameValue} onChange={setRenameValue} autoFocus />
          <div className="mt-5 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setRenaming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={busy}
        title="Delete this video?"
        body={
          <>
            “{deleting?.title}” and all its versions will be removed from your library. This can't be undone.
          </>
        }
      />
    </AppShell>
  );
}

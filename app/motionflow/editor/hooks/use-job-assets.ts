import { useEffect, useRef, useState } from "react";
import { isJobAssetArray } from "../utils";
import type { JobAsset, JobRow, SceneAsset, SceneAssetKind } from "../types";

export function useJobAssets({
  jobId,
  job,
  onShotAssetsUpdated,
}: {
  jobId: string | null;
  job: JobRow | null;
  /** Called after a scene-level drop persists, so the parent can patch the
   *  matching shot's `assets` array in its shots state. */
  onShotAssetsUpdated: (shotId: string, assets: SceneAsset[]) => void;
}) {
  const [jobAssets, setJobAssets] = useState<JobAsset[]>([]);
  const [assetsUploading, setAssetsUploading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const assetsInputRef = useRef<HTMLInputElement | null>(null);
  const assetsHydratedJobIdRef = useRef<string | null>(null);

  // Internal mirror of `jobId` so async handlers see the freshest id.
  const jobIdRef = useRef<string | null>(jobId);
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // Hydrate the asset library once per job. Subsequent polls don't overwrite
  // local additions because we gate on assetsHydratedJobIdRef.
  useEffect(() => {
    if (!job) return;
    if (assetsHydratedJobIdRef.current === job.id) return;
    setJobAssets(isJobAssetArray(job.assets) ? job.assets : []);
    setAssetsError(null);
    assetsHydratedJobIdRef.current = job.id;
  }, [job]);

  const uploadAsset = async (file: File) => {
    const id = jobIdRef.current;
    if (!id) {
      setAssetsError("Generate the storyboard before uploading assets.");
      return;
    }
    setAssetsError(null);
    setAssetsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/jobs/${id}/assets`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        assets?: JobAsset[];
        error?: string;
      };
      if (!res.ok || !data.assets) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setJobAssets(data.assets);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssetsUploading(false);
    }
  };

  const onAssetsChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      // sequential to keep server load predictable and surface per-file errors
      await uploadAsset(file);
    }
  };

  // Drop handler — called by the three scene-level drop targets (timeline
  // scene tiles, right Assets tab, cinema preview). Whatever the source
  // asset's kind is, that becomes the SceneAsset kind; image/video/audio map
  // 1:1, anything else is rejected. (Voice-over / sfx classification isn't
  // disambiguated here — audio defaults to "music"; future UX can re-classify.)
  // The `_targetTrackKind` arg is kept for the timeline tile call so the same
  // signature works there, but it's not currently used in the mapping.
  const handleAssetDrop = async (
    shotId: string,
    _targetTrackKind: "video" | "motion" | "text" | "audio",
    asset: JobAsset,
  ) => {
    let sceneKind: SceneAssetKind | null = null;
    if (asset.kind === "image") sceneKind = "image";
    else if (asset.kind === "video") sceneKind = "video";
    else if (asset.kind === "audio") sceneKind = "music";
    if (!sceneKind) {
      console.warn(`[drop] rejected: unsupported asset kind=${asset.kind}`);
      return;
    }

    try {
      const res = await fetch(`/api/shots/${shotId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: sceneKind,
          url: asset.url,
          name: asset.name,
          source_asset_id: asset.id,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        assets?: unknown;
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.assets)) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onShotAssetsUpdated(shotId, data.assets as SceneAsset[]);
      console.log(
        `[drop] scene ${shotId.slice(0, 8)} ← ${sceneKind} (from "${asset.name}")`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[drop] failed:`, message);
    }
  };

  const removeAsset = async (assetId: string) => {
    const id = jobIdRef.current;
    if (!id) return;
    setAssetsError(null);
    try {
      const res = await fetch(
        `/api/jobs/${id}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        assets?: JobAsset[];
        error?: string;
      };
      if (!res.ok || !data.assets) {
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setJobAssets(data.assets);
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    jobAssets,
    assetsUploading,
    assetsError,
    assetsInputRef,
    uploadAsset,
    onAssetsChange,
    handleAssetDrop,
    removeAsset,
  };
}

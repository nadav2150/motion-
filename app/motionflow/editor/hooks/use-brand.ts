import { useEffect, useRef, useState } from "react";
import { deriveLogoName } from "../utils";
import type { JobRow } from "../types";

export function useBrand({
  jobId,
  job,
}: {
  jobId: string | null;
  job: JobRow | null;
}) {
  // After upload, `brandLogoUrl` holds the persisted public URL (not a blob).
  // Hydrated from the job row when one is loaded; auto-saved via
  // PATCH /api/jobs/:id on every change once a job exists.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [brandLogoStoragePath, setBrandLogoStoragePath] = useState<string | null>(null);
  const [brandLogoName, setBrandLogoName] = useState<string | null>(null);
  const [brandLogoUploading, setBrandLogoUploading] = useState(false);
  const [brandLogoError, setBrandLogoError] = useState<string | null>(null);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [draftColor, setDraftColor] = useState<string>("#7AA2FF");
  const [brandSourceUrl, setBrandSourceUrl] = useState<string>("");
  const [brandScraping, setBrandScraping] = useState(false);
  const [brandScrapeError, setBrandScrapeError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const brandHydratedJobIdRef = useRef<string | null>(null);

  // Internal mirror of `jobId` so async handlers (created before the next
  // render) see the freshest id without re-creating themselves.
  const jobIdRef = useRef<string | null>(jobId);
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // Best-effort PATCH to persist a brand patch onto the current job. No-op
  // when no job exists yet (the brand will be saved with createJob instead).
  const persistBrandPatch = async (patch: {
    brandLogoUrl?: string | null;
    brandLogoStoragePath?: string | null;
    brandColors?: string[];
  }) => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      /* network errors are surfaced via job polling */
    }
  };

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBrandLogoError(null);
    setBrandLogoUploading(true);
    setBrandLogoName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brand/logo", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        logoUrl?: string;
        storagePath?: string;
        error?: string;
      };
      if (!res.ok || !data.logoUrl) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setBrandLogoUrl(data.logoUrl);
      setBrandLogoStoragePath(data.storagePath ?? null);
      void persistBrandPatch({
        brandLogoUrl: data.logoUrl,
        brandLogoStoragePath: data.storagePath ?? null,
      });
    } catch (err) {
      setBrandLogoError(err instanceof Error ? err.message : String(err));
      setBrandLogoName(null);
    } finally {
      setBrandLogoUploading(false);
    }
  };

  const clearLogo = () => {
    setBrandLogoUrl(null);
    setBrandLogoStoragePath(null);
    setBrandLogoName(null);
    setBrandLogoError(null);
    void persistBrandPatch({ brandLogoUrl: null, brandLogoStoragePath: null });
  };

  const addColor = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(draftColor)) return;
    const c = draftColor.toLowerCase();
    setBrandColors((prev) => {
      if (prev.includes(c)) return prev;
      const next = [...prev, c];
      void persistBrandPatch({ brandColors: next });
      return next;
    });
  };

  const handleScrapeFromUrl = async () => {
    const trimmed = brandSourceUrl.trim();
    if (!trimmed) return;
    setBrandScrapeError(null);
    setBrandScraping(true);
    try {
      const res = await fetch("/api/brand/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        palette?: string[];
        logoUrl?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Scrape failed (${res.status})`);
      const colors = (data.palette ?? [])
        .map((c) => c.toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c));
      const patch: { brandColors?: string[]; brandLogoUrl?: string | null } = {};
      if (colors.length > 0) {
        setBrandColors(colors);
        patch.brandColors = colors;
      }
      if (data.logoUrl) {
        setBrandLogoUrl(data.logoUrl);
        setBrandLogoStoragePath(null);
        setBrandLogoName(new URL(data.logoUrl).hostname);
        patch.brandLogoUrl = data.logoUrl;
      }
      if (Object.keys(patch).length > 0) {
        void persistBrandPatch(patch);
      }
    } catch (err) {
      setBrandScrapeError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrandScraping(false);
    }
  };

  const removeColor = (c: string) =>
    setBrandColors((prev) => {
      const next = prev.filter((x) => x !== c);
      void persistBrandPatch({ brandColors: next });
      return next;
    });

  // Hydrate brand state once per job. Subsequent polls won't overwrite local
  // edits because we gate on brandHydratedJobIdRef.
  useEffect(() => {
    if (!job) return;
    if (brandHydratedJobIdRef.current === job.id) return;
    setBrandLogoUrl(job.brand_logo_url ?? null);
    setBrandLogoStoragePath(job.brand_logo_storage_path ?? null);
    setBrandLogoName(job.brand_logo_url ? deriveLogoName(job.brand_logo_url) : null);
    setBrandColors(Array.isArray(job.brand_colors) ? job.brand_colors : []);
    setBrandLogoError(null);
    brandHydratedJobIdRef.current = job.id;
  }, [job]);

  return {
    brandLogoUrl,
    brandLogoStoragePath,
    brandLogoName,
    brandLogoUploading,
    brandLogoError,
    brandColors,
    draftColor,
    setDraftColor,
    brandSourceUrl,
    setBrandSourceUrl,
    brandScraping,
    brandScrapeError,
    logoInputRef,
    onLogoChange,
    clearLogo,
    addColor,
    removeColor,
    handleScrapeFromUrl,
  };
}

export type FreesoundLicense = "cc0" | "cc-by";

export type FreesoundSfx = {
  id: string;
  name: string;
  author: string;
  durationSec: number;
  previewUrl: string;
  license: FreesoundLicense;
  licenseUrl: string;
  tags: string[];
};

type FreesoundApiResult = {
  id?: number;
  name?: string;
  username?: string;
  duration?: number;
  license?: string;
  tags?: string[];
  previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string };
};

type FreesoundApiResponse = {
  count?: number;
  results?: FreesoundApiResult[];
  detail?: string;
};

function getApiKey(): string {
  const key = process.env.FREESOUND_API_KEY;
  if (!key) {
    throw new Error("FREESOUND_API_KEY is not set");
  }
  return key;
}

function classifyLicense(url: string | undefined): FreesoundLicense | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("publicdomain/zero") || u.includes("/cc0/")) return "cc0";
  // Pure Attribution only — exclude noncommercial / sharealike / sampling+
  if (u.includes("/by/")) return "cc-by";
  return null;
}

function normalize(item: FreesoundApiResult): FreesoundSfx | null {
  const id = item.id != null ? String(item.id) : "";
  const previewUrl = item.previews?.["preview-hq-mp3"] ?? item.previews?.["preview-lq-mp3"];
  const license = classifyLicense(item.license);
  if (!id || !previewUrl || !license) return null;

  return {
    id,
    name: item.name ?? "Untitled",
    author: item.username ?? "Unknown",
    durationSec: typeof item.duration === "number" ? item.duration : 0,
    previewUrl,
    license,
    licenseUrl: item.license ?? "",
    tags: Array.isArray(item.tags) ? item.tags : [],
  };
}

export async function searchSfx(query: string, limit = 20): Promise<FreesoundSfx[]> {
  const token = getApiKey();
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", query);
  url.searchParams.set("page_size", String(limit));
  // Restrict to CC0 + pure CC-BY (Attribution). Exclude NonCommercial, Sampling+.
  url.searchParams.set(
    "filter",
    'license:("Creative Commons 0" OR "Attribution")',
  );
  url.searchParams.set("fields", "id,name,username,duration,license,tags,previews");

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Token ${token}` },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as FreesoundApiResponse;
      if (body.detail) detail = `: ${body.detail}`;
    } catch {
      // ignore
    }
    throw new Error(`Freesound request failed (${res.status})${detail}`);
  }

  const body = (await res.json()) as FreesoundApiResponse;
  const results = Array.isArray(body.results) ? body.results : [];
  return results
    .map(normalize)
    .filter((s): s is FreesoundSfx => s !== null);
}

export type JamendoTrack = {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  streamUrl: string;
  downloadUrl: string | null;
  artworkUrl: string | null;
  license: string | null;
  tags: string[];
};

type JamendoApiTrack = {
  id?: string | number;
  name?: string;
  artist_name?: string;
  duration?: number;
  audio?: string;
  audiodownload?: string;
  image?: string;
  license_ccurl?: string;
  musicinfo?: { tags?: { vartags?: string[]; genres?: string[]; instruments?: string[] } };
};

type JamendoApiResponse = {
  headers?: { status?: string; error_message?: string };
  results?: JamendoApiTrack[];
};

function getApiKey(): string {
  const key = process.env.JAMENDO_API_KEY;
  if (!key) {
    throw new Error("JAMENDO_API_KEY is not set");
  }
  return key;
}

function normalize(track: JamendoApiTrack): JamendoTrack | null {
  const id = track.id != null ? String(track.id) : "";
  const streamUrl = typeof track.audio === "string" ? track.audio : "";
  if (!id || !streamUrl) return null;

  const info = track.musicinfo?.tags;
  const tags: string[] = [];
  if (info?.genres) tags.push(...info.genres);
  if (info?.vartags) tags.push(...info.vartags);

  return {
    id,
    title: track.name ?? "Untitled",
    artist: track.artist_name ?? "Unknown",
    durationSec: typeof track.duration === "number" ? track.duration : 0,
    streamUrl,
    downloadUrl: typeof track.audiodownload === "string" ? track.audiodownload : null,
    artworkUrl: typeof track.image === "string" ? track.image : null,
    license: typeof track.license_ccurl === "string" ? track.license_ccurl : null,
    tags,
  };
}

export async function searchTracks(query: string, limit = 20): Promise<JamendoTrack[]> {
  const clientId = getApiKey();
  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("include", "musicinfo");
  url.searchParams.set("imagesize", "200");

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Jamendo request failed (${res.status})`);
  }

  const body = (await res.json()) as JamendoApiResponse;
  if (body.headers?.status && body.headers.status !== "success") {
    throw new Error(`Jamendo error: ${body.headers.error_message ?? body.headers.status}`);
  }

  const results = Array.isArray(body.results) ? body.results : [];
  return results
    .map(normalize)
    .filter((t): t is JamendoTrack => t !== null);
}

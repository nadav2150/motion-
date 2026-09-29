import { describe, expect, it } from "vitest";
import {
  canonicalYouTubeUrl,
  fetchPublicUrl,
  formatReferenceBrief,
  isPrivateIp,
  truncateAtWord,
  isYouTubeUrl,
  validateReferenceUrl,
  type ReferenceAnalysis,
} from "./reference-video";

describe("canonicalYouTubeUrl", () => {
  it("drops playlist, timestamp and tracking parameters", () => {
    expect(canonicalYouTubeUrl("https://www.youtube.com/watch?v=mtPqxJBMXCQ&list=PLvr0s6WLGo2bCGXjB5ecHQ-JLPgmxMULe")).toBe(
      "https://www.youtube.com/watch?v=mtPqxJBMXCQ",
    );
    expect(canonicalYouTubeUrl("https://m.youtube.com/watch?t=42&v=mtPqxJBMXCQ&si=abc")).toBe(
      "https://www.youtube.com/watch?v=mtPqxJBMXCQ",
    );
  });
  it("handles short, shorts, embed and live links", () => {
    for (const url of [
      "https://youtu.be/mtPqxJBMXCQ?si=xyz",
      "https://www.youtube.com/shorts/mtPqxJBMXCQ",
      "https://www.youtube.com/embed/mtPqxJBMXCQ",
      "https://www.youtube.com/live/mtPqxJBMXCQ?feature=share",
      "https://music.youtube.com/watch?v=mtPqxJBMXCQ&list=RD",
    ]) {
      expect(canonicalYouTubeUrl(url)).toBe("https://www.youtube.com/watch?v=mtPqxJBMXCQ");
    }
  });
  it("returns null without a single video id", () => {
    expect(canonicalYouTubeUrl("https://www.youtube.com/playlist?list=PLvr0s6WLGo2bCGXjB5ecHQ-JLPgmxMULe")).toBeNull();
    expect(canonicalYouTubeUrl("https://www.youtube.com/@somechannel")).toBeNull();
    expect(canonicalYouTubeUrl("not a url")).toBeNull();
  });
});

describe("isYouTubeUrl", () => {
  it("recognises youtube hosts", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/shorts/abc")).toBe(true);
  });
  it("rejects other hosts and garbage", () => {
    expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
    expect(isYouTubeUrl("not a url")).toBe(false);
  });
});

describe("validateReferenceUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateReferenceUrl("https://cdn.example.com/clip.mp4")).toBeNull();
    expect(validateReferenceUrl("https://pxynebeabrwfpucmlsce.supabase.co/storage/v1/object/public/storyboards/reference/u/x.mp4")).toBeNull();
  });
  it("rejects non-http, private and loopback targets", () => {
    expect(validateReferenceUrl("ftp://example.com/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://localhost:3000/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://127.0.0.1/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://192.168.1.4/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://10.0.0.1/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("http://[::1]/a.mp4")).not.toBeNull();
    expect(validateReferenceUrl("nonsense")).not.toBeNull();
  });
});

describe("isPrivateIp", () => {
  it("flags private, loopback, link-local and ULA", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "104.18.2.3", "2606:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe("fetchPublicUrl", () => {
  const publicDns = async () => [{ address: "93.184.216.34" }];

  it("re-validates every redirect hop and rejects one resolving to a private IP", async () => {
    const fetchImpl = (async (url: string) => {
      if (url === "https://a.example.com/v.mp4") {
        return new Response(null, { status: 302, headers: { location: "https://internal.example.com/x" } });
      }
      return new Response("ok");
    }) as unknown as typeof fetch;
    const resolve = async (host: string) =>
      host === "internal.example.com" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }];
    await expect(fetchPublicUrl("https://a.example.com/v.mp4", { fetchImpl, resolve })).rejects.toThrow(/public URL/);
  });

  it("follows at most 3 redirects", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response(null, { status: 301, headers: { location: `https://a.example.com/${n}` } });
    }) as unknown as typeof fetch;
    await expect(fetchPublicUrl("https://a.example.com/0", { fetchImpl, resolve: publicDns })).rejects.toThrow(/more than 3/);
    expect(n).toBe(4);
  });

  it("returns the final response", async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith("/start")
        ? new Response(null, { status: 302, headers: { location: "/final.mp4" } })
        : new Response("video", { headers: { "content-type": "video/mp4" } })) as unknown as typeof fetch;
    const res = await fetchPublicUrl("https://a.example.com/start", { fetchImpl, resolve: publicDns });
    expect(await res.text()).toBe("video");
  });
});

describe("truncateAtWord", () => {
  it("cuts at a word boundary under the cap", () => {
    expect(truncateAtWord("one two three four", 10)).toBe("one two");
    expect(truncateAtWord("short", 10)).toBe("short");
  });
});

describe("formatReferenceBrief", () => {
  it("renders palette, beats and notes", () => {
    const a: ReferenceAnalysis = {
      summary: "Fast kinetic-type launch teaser.",
      totalDurationSeconds: 15,
      aspectRatio: "16:9",
      pacing: "0.8s average shot",
      editingRhythm: "cuts on the kick",
      colorPalette: ["#0a0a0a", "#ffda2a"],
      typography: "bold grotesk, all caps",
      motionStyle: "snappy expo-out",
      cameraMoves: "slow push-in",
      transitions: ["hard cut", "mask wipe"],
      audioMood: "128 BPM electro",
      beats: [
        { start: 0, end: 1.5, description: "logo slam", onScreenText: "NEW", motion: "scale 1.4→1", transitionOut: "hard cut" },
      ],
      suggestedScript: "Meet the new thing.",
      recreationNotes: "Keep every beat under a second.",
      model: "gemini-3.5-flash",
    };
    const brief = formatReferenceBrief(a);
    expect(brief).toContain("REFERENCE VIDEO");
    expect(brief).toContain("#0a0a0a, #ffda2a");
    expect(brief).toContain('0.0–1.5s: logo slam | text: "NEW"');
    expect(brief).toContain("hard cut · mask wipe");
    expect(brief).toContain("recreationNotes: Keep every beat under a second.");
  });
});

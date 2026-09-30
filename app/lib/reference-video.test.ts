import { describe, expect, it } from "vitest";
import {
  canonicalYouTubeUrl,
  fetchPublicUrl,
  formatReferenceBrief,
  isPrivateIp,
  truncateAtWord,
  isYouTubeUrl,
  normalizeAnalysis,
  validateReferenceUrl,
  youTubeThumbnailUrls,
  youTubeVideoId,
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

describe("youTubeThumbnailUrls", () => {
  it("builds maxres then hq thumbnail URLs from any single-video link", () => {
    for (const url of ["https://youtu.be/mtPqxJBMXCQ?si=x", "https://www.youtube.com/shorts/mtPqxJBMXCQ", "https://m.youtube.com/watch?v=mtPqxJBMXCQ&t=3"]) {
      expect(youTubeThumbnailUrls(url)).toEqual([
        "https://i.ytimg.com/vi/mtPqxJBMXCQ/maxresdefault.jpg",
        "https://i.ytimg.com/vi/mtPqxJBMXCQ/hqdefault.jpg",
      ]);
    }
    expect(youTubeVideoId("https://youtu.be/mtPqxJBMXCQ")).toBe("mtPqxJBMXCQ");
  });
  it("returns nothing without a valid video id", () => {
    expect(youTubeThumbnailUrls("https://www.youtube.com/playlist?list=PL1")).toEqual([]);
    expect(youTubeThumbnailUrls("https://youtu.be/abc")).toEqual([]);
    expect(youTubeThumbnailUrls("not a url")).toEqual([]);
  });
});

describe("normalizeAnalysis", () => {
  it("keeps the old fields working when the new ones are missing", () => {
    const a = normalizeAnalysis({ summary: " s ", beats: [{ start: 0, end: 2, description: "d" }], colorPalette: ["#ABCDEF", "red"] }, "m");
    expect(a.summary).toBe("s");
    expect(a.colorPalette).toEqual(["#abcdef"]);
    expect(a.beats[0]).toEqual({ start: 0, end: 2, description: "d", onScreenText: "", motion: "", transitionOut: "" });
    expect(a).not.toHaveProperty("designSystem");
    expect(a).not.toHaveProperty("fontMatches");
    expect(normalizeAnalysis({ recreationNotes: ["Use caps", " Cut on the kick ", 3] }, "m").recreationNotes).toBe("Use caps; Cut on the kick");
  });

  it("normalizes the per-beat visual spec", () => {
    const a = normalizeAnalysis(
      {
        designSystem: " 12-col grid, 6% margins ",
        fontMatches: ["Inter Tight", 42, "<script>", "Space Grotesk", "Manrope", "Extra"],
        totalDurationSeconds: "14.5",
        beats: [
          {
            start: "1",
            end: 4,
            keyTime: 2.5,
            visual: {
              layout: "headline left at x 8%, y 40%",
              background: "#101014 flat",
              textStyle: "800, uppercase, -0.02em, 9% of frame height",
              uiElements: 7,
              colorUsage: [
                { element: "headline", hex: "#FFF" },
                { element: "accent bar", hex: "#ff5a36" },
                { element: "bad", hex: "orange" },
                "junk",
              ],
              transitionIn: "mask wipe up, expo.out, 0.6s",
              transitionOut: "hard cut",
              camera: "static",
              keyFrame: "x".repeat(5000),
            },
          },
          { start: 4, end: 6, keyTime: 9, visual: { layout: "", colorUsage: [] } },
          { start: 6, end: 5, visual: "not an object" },
          null,
          "junk",
        ],
      },
      "gemini",
    );
    expect(a.designSystem).toBe("12-col grid, 6% margins");
    expect(a.fontMatches).toEqual(["Inter Tight", "script", "Space Grotesk"]);
    expect(a.totalDurationSeconds).toBe(14.5);
    expect(a.beats).toHaveLength(3);
    const [b0, b1, b2] = a.beats;
    expect(b0!.start).toBe(1);
    expect(b0!.keyTime).toBe(2.5);
    expect(b0!.visual!.colorUsage).toEqual([
      { element: "headline", hex: "#ffffff" },
      { element: "accent bar", hex: "#ff5a36" },
    ]);
    expect(b0!.visual!.uiElements).toBe("");
    expect(b0!.visual!.keyFrame.length).toBe(1200);
    expect(b1!.keyTime).toBeUndefined(); // outside the beat
    expect(b1!.visual).toBeUndefined(); // empty spec dropped
    expect(b2!.end).toBe(6); // end never before start
    expect(b2!.visual).toBeUndefined();
  });
});

describe("formatReferenceBrief — visual spec", () => {
  const a: ReferenceAnalysis = normalizeAnalysis(
    {
      summary: "Minimal SaaS promo",
      totalDurationSeconds: 8,
      designSystem: "8% margins",
      fontMatches: ["Inter"],
      beats: [
        {
          start: 0,
          end: 4,
          description: "headline",
          visual: { layout: "left third", textStyle: "900 caps", colorUsage: [{ element: "bg", hex: "#000000" }], keyFrame: "a black frame with a word" },
        },
      ],
    },
    "m",
  );
  it("includes design system, fonts and each beat's spec; key frames on request", () => {
    const brief = formatReferenceBrief(a);
    expect(brief).toContain("designSystem:   8% margins");
    expect(brief).toContain("closestFonts:   Inter");
    expect(brief).toContain("#1 0.0–4.0s: headline");
    expect(brief).toContain("layout: left third");
    expect(brief).toContain("colors: bg #000000");
    expect(brief).not.toContain("keyFrame:");
    expect(formatReferenceBrief(a, { keyFrames: true })).toContain("keyFrame: a black frame with a word");
    expect(formatReferenceBrief(a, { header: "CUSTOM:" }).split("\n")[0]).toBe("CUSTOM:");
  });
  it("drops per-beat specs when the brief would be huge", () => {
    const big: ReferenceAnalysis = {
      ...a,
      beats: Array.from({ length: 40 }, (_, i) => ({
        ...a.beats[0]!,
        start: i,
        end: i + 1,
        visual: { ...a.beats[0]!.visual!, layout: "y".repeat(700), background: "z".repeat(700) },
      })),
    };
    const brief = formatReferenceBrief(big);
    expect(brief.length).toBeLessThanOrEqual(24_000);
    expect(brief).not.toContain("layout: yyy");
    expect(brief).toContain("#40 39.0–40.0s");
  });
});

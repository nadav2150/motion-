import { describe, expect, it } from "vitest";
import {
  buildDocumentCsp,
  clampTargetDuration,
  downloadFilename,
  exportDimensions,
  formatGuide,
  injectShim,
  maxVideoDuration,
  nearestPreset,
  parseAspectRatio,
  parseExportOptions,
  resolveFormat,
} from "./format";
import { FORMAT_PRESETS } from "./types";

describe("parseAspectRatio", () => {
  it("parses ratios in many spellings", () => {
    expect(parseAspectRatio("16:9")).toBeCloseTo(16 / 9);
    expect(parseAspectRatio("9 x 16")).toBeCloseTo(9 / 16);
    expect(parseAspectRatio("1.78:1")).toBeCloseTo(1.78);
    expect(parseAspectRatio("2.35")).toBeCloseTo(2.35);
    expect(parseAspectRatio("vertical (9:16)")).toBeCloseTo(9 / 16);
    expect(parseAspectRatio("Portrait")).toBeCloseTo(9 / 16);
    expect(parseAspectRatio("square")).toBe(1);
    expect(parseAspectRatio("")).toBeNull();
    expect(parseAspectRatio("unknown")).toBeNull();
  });
});

describe("nearestPreset / resolveFormat", () => {
  it("maps odd ratios to the nearest preset", () => {
    expect(nearestPreset(4 / 5).format).toBe("1:1");
    expect(nearestPreset(21 / 9).format).toBe("16:9");
    expect(nearestPreset(2 / 3).format).toBe("9:16");
  });
  it("match uses the reference, falls back to 16:9", () => {
    expect(resolveFormat("match", { aspectRatio: "9:16" })).toEqual(FORMAT_PRESETS["9:16"]);
    expect(resolveFormat("match", { aspectRatio: "4:5" })).toEqual(FORMAT_PRESETS["1:1"]);
    expect(resolveFormat("match", null)).toEqual(FORMAT_PRESETS["16:9"]);
    expect(resolveFormat("1:1", { aspectRatio: "16:9" })).toEqual(FORMAT_PRESETS["1:1"]);
  });
});

describe("durations", () => {
  it("snaps to allowed options under the plan cap", () => {
    expect(clampTargetDuration(60, 15)).toBe(15);
    expect(clampTargetDuration(45, 60)).toBe(45);
    expect(clampTargetDuration(40, 30)).toBe(30);
  });
  it("caps the rendered duration", () => {
    expect(maxVideoDuration(15, 15)).toBe(20);
    expect(maxVideoDuration(30, 60)).toBe(41);
  });
});

describe("export", () => {
  it("scales dimensions per resolution", () => {
    expect(exportDimensions(FORMAT_PRESETS["16:9"], "720p")).toEqual({ width: 1280, height: 720, scale: 2 / 3 });
    expect(exportDimensions(FORMAT_PRESETS["9:16"], "4k")).toEqual({ width: 2160, height: 3840, scale: 2 });
  });
  it("parses export options and forces the watermark for free plans", () => {
    const free = { watermark: true, export4k: false };
    expect(parseExportOptions({ resolution: "4k" }, free)).toMatchObject({ status: 403 });
    expect(parseExportOptions({ resolution: "8k" }, free)).toMatchObject({ status: 400 });
    expect(parseExportOptions({ watermark: false }, free)).toMatchObject({ watermark: true, resolution: "1080p", includeVoiceover: true });
    expect(parseExportOptions({ watermark: false, quality: "high", revision: 2 }, { watermark: false, export4k: true })).toMatchObject({
      watermark: false,
      quality: "high",
      revision: 2,
    });
  });
});

describe("formatGuide", () => {
  it("gives vertical formats bigger type and a bottom UI band", () => {
    const v = formatGuide(FORMAT_PRESETS["9:16"]);
    const h = formatGuide(FORMAT_PRESETS["16:9"]);
    expect(v.headlinePx[0]).toBeGreaterThan(h.headlinePx[0]);
    expect(v.safeArea.bottom).toBeGreaterThan(300);
  });
});

describe("document helpers", () => {
  it("builds the contract CSP", () => {
    const csp = buildDocumentCsp("abc.supabase.co");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("img-src 'self' https://abc.supabase.co data: blob:");
    expect(csp).toContain("connect-src 'none'");
  });
  it("injects the shim as the first script in head", () => {
    const out = injectShim('<!DOCTYPE html><html><head lang="en"><script>a()</script></head><body></body></html>', "shim()</script>");
    expect(out).toContain('<head lang="en"><script>shim()<\\/script></script><script>a()');
  });
  it("makes safe download names", () => {
    expect(downloadFilename("Launch: Ünicorn ✨ Promo!", 3)).toBe("launch-unicorn-promo-v3.mp4");
    expect(downloadFilename(null, 1)).toBe("videly-video-v1.mp4");
  });
});

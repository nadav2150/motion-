import { describe, expect, it } from "vitest";
import {
  CREDITS_EDIT_REWRITE,
  CREDITS_STUDIO_REPAIR,
  estimateStudioEdit,
  estimateStudioJob,
  estimateStudioRender,
  voiceoverCredits,
} from "./estimate";

describe("estimateStudioJob", () => {
  it("adds up the parts", () => {
    const e = estimateStudioJob({ targetDuration: 30, maxDuration: 41, voiceover: true, music: true, reference: true });
    expect(e.total).toBe(e.base + e.repair + e.review + e.reference + e.images + e.voiceover + e.music + e.render);
    expect(e.render).toBe(41 * 5);
    expect(e.reference).toBe(50);
  });
  it("drops optional parts when off", () => {
    const e = estimateStudioJob({ targetDuration: 15, maxDuration: 20, voiceover: false, music: false, reference: false, render: false });
    expect(e.voiceover + e.music + e.reference + e.render).toBe(0);
  });
  it("fits a free 15s job inside the free grant (3,100)", () => {
    const e = estimateStudioJob({ targetDuration: 15, maxDuration: 20, voiceover: false, music: false, reference: false });
    expect(e.total).toBeLessThanOrEqual(3100);
  });
});

describe("voiceover / render / edit", () => {
  it("clamps voiceover credits to 150–300", () => {
    expect(voiceoverCredits(5)).toBe(150);
    expect(voiceoverCredits(60)).toBe(270);
    expect(voiceoverCredits(300)).toBe(300);
  });
  it("doubles render credits for 4K", () => {
    expect(estimateStudioRender(30, "1080p")).toBe(150);
    expect(estimateStudioRender(30, "4k")).toBe(300);
  });
  it("reserves the rewrite ceiling by default", () => {
    expect(estimateStudioEdit()).toBe(CREDITS_EDIT_REWRITE + CREDITS_STUDIO_REPAIR);
    expect(estimateStudioEdit({ expectRewrite: false })).toBeLessThan(estimateStudioEdit());
  });
});

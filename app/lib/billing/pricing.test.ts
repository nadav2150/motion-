import { describe, expect, it } from "vitest";
import { usdMicrosForAnthropic, usdMicrosForGemini } from "./pricing-usd";
import { creditsForAnthropic, weightedTokens } from "./meter";
import { computeSettlement } from "./credits";

describe("usdMicrosForAnthropic", () => {
  it("prices opus 5.5 input, output, cache read and cache write", () => {
    // 1M in = $4, 1M out = $20, 1M cache read = $0.20, 1M cache write = $5
    expect(usdMicrosForAnthropic("claude-opus-5-5", { input_tokens: 1_000_000 })).toBe(4_000_000);
    expect(usdMicrosForAnthropic("claude-opus-5-5", { output_tokens: 1_000_000 })).toBe(20_000_000);
    expect(usdMicrosForAnthropic("claude-opus-5-5", { cache_read_input_tokens: 1_000_000 })).toBe(200_000);
    expect(usdMicrosForAnthropic("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000 })).toBe(5_000_000);
  });
  it("keeps older models and derives cache rates from input", () => {
    expect(usdMicrosForAnthropic("claude-sonnet-4-6", { input_tokens: 1000, output_tokens: 1000 })).toBe(18_000);
    expect(usdMicrosForAnthropic("claude-opus-4-7", { cache_read_input_tokens: 1000 })).toBe(1500);
  });
  it("matches dated model ids by prefix", () => {
    expect(usdMicrosForAnthropic("claude-opus-5-5-20260801", { input_tokens: 10 })).toBe(40);
  });
  it("converts to credits at $0.001 per credit", () => {
    expect(creditsForAnthropic("claude-opus-5-5", { input_tokens: 10_000, output_tokens: 1_000 })).toBe(60);
  });
});

describe("weightedTokens", () => {
  it("counts cache reads at a tenth", () => {
    expect(weightedTokens({ input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 })).toBe(260);
  });
});

describe("usdMicrosForGemini", () => {
  it("bills thinking tokens as output", () => {
    const m = usdMicrosForGemini("gemini-3.5-flash", { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 100 });
    expect(m).toBe(Math.ceil(1000 * 1.5 + 200 * 9));
  });
});

describe("computeSettlement", () => {
  it("refunds the unused part of a single reservation", () => {
    const s = computeSettlement([
      { kind: "reserve", reason: "reservation", delta: -1000 },
      { kind: "consume", reason: "x", delta: -300 },
    ]);
    expect(s.outstanding).toBe(700);
  });
  it("settles a second reservation on the same job after the first was refunded", () => {
    const s = computeSettlement([
      { kind: "reserve", reason: "reservation", delta: -1000 },
      { kind: "consume", reason: "x", delta: -300 },
      { kind: "refund", reason: "reconcile_unused_reservation", delta: 700 },
      { kind: "reserve", reason: "reservation", delta: -250 },
      { kind: "consume", reason: "x", delta: -100 },
    ]);
    expect(s.reservations).toBe(2);
    expect(s.outstanding).toBe(150);
  });
  it("does not claw back an already-recorded overrun", () => {
    const s = computeSettlement([
      { kind: "reserve", reason: "reservation", delta: -100 },
      { kind: "consume", reason: "x", delta: -150 },
      { kind: "adjust", reason: "reconcile_overrun", delta: -50 },
      { kind: "reserve", reason: "reservation", delta: -100 },
      { kind: "consume", reason: "x", delta: -40 },
    ]);
    expect(s.outstanding).toBe(60);
  });
});

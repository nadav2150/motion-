import { expect, test } from "vitest";
import { changeDirection, estimateChargeToday, planChangeGrant, remainingFraction } from "./plan-change";

const DAY = 24 * 60 * 60 * 1000;

test("remainingFraction clamps and handles missing dates", () => {
  const start = Date.UTC(2026, 9, 1);
  const end = start + 30 * DAY;
  const iso = (t: number) => new Date(t).toISOString();
  expect(remainingFraction(iso(start), iso(end), start)).toBe(1);
  expect(remainingFraction(iso(start), iso(end), start + 15 * DAY)).toBeCloseTo(0.5);
  expect(remainingFraction(iso(start), iso(end), end + DAY)).toBe(0);
  expect(remainingFraction(iso(start), iso(end), start - DAY)).toBe(1);
  expect(remainingFraction(null, iso(end))).toBe(1);
  expect(remainingFraction(iso(end), iso(start))).toBe(1);
});

test("direction", () => {
  expect(changeDirection("starter", "pro")).toBe("up");
  expect(changeDirection("studio", "starter")).toBe("down");
});

test("Dodo upgrade (period restarts): new batch minus unused old batch", () => {
  // Day 0: nothing of Starter used → 20,000 − 8,000.
  expect(planChangeGrant("dodo", "starter", "pro", 1)).toBe(12_000);
  // Halfway: 20,000 − 4,000.
  expect(planChangeGrant("dodo", "starter", "pro", 0.5)).toBe(16_000);
  // Period over: full new batch.
  expect(planChangeGrant("dodo", "starter", "pro", 0)).toBe(20_000);
});

test("Polar upgrade (period kept): prorated difference", () => {
  expect(planChangeGrant("polar", "starter", "pro", 1)).toBe(12_000);
  expect(planChangeGrant("polar", "starter", "pro", 0.5)).toBe(6_000);
  expect(planChangeGrant("polar", "starter", "pro", 0)).toBe(0);
});

test("downgrades never grant credits", () => {
  expect(planChangeGrant("dodo", "studio", "pro", 0.5)).toBe(0);
  expect(planChangeGrant("polar", "pro", "starter", 1)).toBe(0);
});

test("charge estimate tracks the provider's proration", () => {
  expect(estimateChargeToday("dodo", "starter", "pro", 0.5)).toBe(39.5);
  expect(estimateChargeToday("polar", "starter", "pro", 0.5)).toBe(15);
  expect(estimateChargeToday("dodo", "pro", "starter", 0.5)).toBe(0);
});

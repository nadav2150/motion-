import { afterEach, beforeEach, expect, test } from "vitest";
import {
  PACKS,
  PLANS,
  cheapestTierWith,
  isPack,
  isTier,
  nextTier,
  tiersAbove,
} from "./catalog";
import { buildDodoCatalog } from "./dodo";
import { buildCatalog } from "./polar";

const PRODUCT_KEYS = ["STARTER", "PRO", "STUDIO", "PACK_SMALL", "PACK_MEDIUM", "PACK_LARGE"];

beforeEach(() => {
  for (const k of PRODUCT_KEYS) {
    process.env[`POLAR_SANDBOX_PRODUCT_${k}`] = `polar_${k.toLowerCase()}`;
    process.env[`DODO_TEST_PRODUCT_${k}`] = `dodo_${k.toLowerCase()}`;
  }
});

afterEach(() => {
  for (const k of PRODUCT_KEYS) {
    delete process.env[`POLAR_SANDBOX_PRODUCT_${k}`];
    delete process.env[`DODO_TEST_PRODUCT_${k}`];
  }
});

test("Polar and Dodo catalogs grant exactly what the shared catalog says", () => {
  for (const [prefix, catalog] of [["polar", buildCatalog()], ["dodo", buildDodoCatalog()]] as const) {
    expect(catalog[`${prefix}_starter`]).toEqual({ kind: "subscription", planTier: "starter", monthlyGrant: PLANS.starter.monthlyCredits });
    expect(catalog[`${prefix}_pro`]).toEqual({ kind: "subscription", planTier: "pro", monthlyGrant: PLANS.pro.monthlyCredits });
    expect(catalog[`${prefix}_studio`]).toEqual({ kind: "subscription", planTier: "studio", monthlyGrant: PLANS.studio.monthlyCredits });
    expect(catalog[`${prefix}_pack_small`]).toEqual({ kind: "credit_pack", packSize: "small", credits: PACKS.small.credits });
    expect(catalog[`${prefix}_pack_medium`]).toEqual({ kind: "credit_pack", packSize: "medium", credits: PACKS.medium.credits });
    expect(catalog[`${prefix}_pack_large`]).toEqual({ kind: "credit_pack", packSize: "large", credits: PACKS.large.credits });
  }
});

test("published prices and grants", () => {
  expect([PLANS.starter.priceUsd, PLANS.pro.priceUsd, PLANS.studio.priceUsd]).toEqual([19, 49, 149]);
  expect([PLANS.starter.monthlyCredits, PLANS.pro.monthlyCredits, PLANS.studio.monthlyCredits]).toEqual([8_000, 20_000, 60_000]);
  expect([PACKS.small.priceUsd, PACKS.medium.priceUsd, PACKS.large.priceUsd]).toEqual([13, 59, 159]);
});

test("tier helpers", () => {
  expect(isTier("pro")).toBe(true);
  expect(isTier("free")).toBe(false);
  expect(isPack("medium")).toBe(true);
  expect(isPack("none")).toBe(false);
  expect(tiersAbove("free")).toEqual(["starter", "pro", "studio"]);
  expect(tiersAbove("pro")).toEqual(["studio"]);
  expect(tiersAbove(null)).toEqual(["starter", "pro", "studio"]);
  expect(nextTier("studio")).toBeNull();
  expect(nextTier("starter")).toBe("pro");
});

test("cheapestTierWith finds the plan that unlocks a feature", () => {
  expect(cheapestTierWith("export4k")).toBe("pro");
  expect(cheapestTierWith("audio")).toBe("starter");
  expect(cheapestTierWith("maxStudioDuration", 30)).toBe("starter");
  expect(cheapestTierWith("maxStudioDuration", 45)).toBe("pro");
  expect(cheapestTierWith("apiAccess")).toBe("studio");
});

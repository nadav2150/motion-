import { afterEach, beforeEach, expect, test } from "vitest";
import { buildCatalog, lookupProduct } from "./polar";

const ENV_KEYS = [
  "POLAR_SANDBOX_PRODUCT_PRO",
  "POLAR_SANDBOX_PRODUCT_PACK_SMALL",
];

beforeEach(() => {
  process.env.POLAR_ENV = "sandbox";
  process.env.POLAR_SANDBOX_PRODUCT_PRO = "prod_pro_123";
  process.env.POLAR_SANDBOX_PRODUCT_PACK_SMALL = "prod_pack_small_123";
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  delete process.env.POLAR_ENV;
});

test("buildCatalog maps a subscription product to its tier + grant", () => {
  const cat = buildCatalog();
  expect(cat["prod_pro_123"]).toEqual({
    kind: "subscription",
    planTier: "pro",
    monthlyGrant: 20_000,
  });
});

test("buildCatalog maps a credit pack product to its size + credits", () => {
  const cat = buildCatalog();
  expect(cat["prod_pack_small_123"]).toEqual({
    kind: "credit_pack",
    packSize: "small",
    credits: 5_000,
  });
});

test("lookupProduct returns null for unknown product id", () => {
  expect(lookupProduct("nope")).toBeNull();
});

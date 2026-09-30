import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  DodoWebhookVerificationError,
  buildDodoCatalog,
  lookupDodoProduct,
  normalizeDodoStatus,
  verifyDodoWebhook,
} from "./dodo";
import { billingProvider } from "./provider";

const ENV_KEYS = [
  "DODO_ENV",
  "DODO_TEST_PRODUCT_PRO",
  "DODO_TEST_PRODUCT_PACK_SMALL",
  "DODO_LIVE_PRODUCT_PRO",
  "BILLING_PROVIDER",
];

beforeEach(() => {
  process.env.DODO_TEST_PRODUCT_PRO = "pdt_test_pro";
  process.env.DODO_TEST_PRODUCT_PACK_SMALL = "pdt_test_small";
  process.env.DODO_LIVE_PRODUCT_PRO = "pdt_live_pro";
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

test("catalog defaults to test_mode product ids", () => {
  expect(buildDodoCatalog()["pdt_test_pro"]).toEqual({ kind: "subscription", planTier: "pro", monthlyGrant: 20_000 });
  expect(lookupDodoProduct("pdt_test_small")).toEqual({ kind: "credit_pack", packSize: "small", credits: 5_000 });
  expect(lookupDodoProduct("pdt_live_pro")).toBeNull();
});

test("DODO_ENV=live_mode switches to live product ids", () => {
  process.env.DODO_ENV = "live_mode";
  expect(lookupDodoProduct("pdt_live_pro")?.kind).toBe("subscription");
  expect(lookupDodoProduct("pdt_test_pro")).toBeNull();
});

test("normalizeDodoStatus maps cancelled onto the app's spelling", () => {
  expect(normalizeDodoStatus("cancelled")).toBe("canceled");
  expect(normalizeDodoStatus("active")).toBe("active");
  expect(normalizeDodoStatus("on_hold")).toBe("on_hold");
});

test("billingProvider defaults to polar", () => {
  expect(billingProvider()).toBe("polar");
  process.env.BILLING_PROVIDER = "DODO";
  expect(billingProvider()).toBe("dodo");
});

// ─── Standard Webhooks signature ───

const key = Buffer.from("videly-test-signing-key-32-bytes!!");
const secret = `whsec_${key.toString("base64")}`;
const body = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
const now = 1_790_000_000;

function sign(id: string, ts: number, payload: string): string {
  return createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
}

function headers(sig: string, ts = now) {
  return { "webhook-id": "msg_1", "webhook-timestamp": String(ts), "webhook-signature": sig };
}

test("accepts a valid signature, including among several", () => {
  const sig = sign("msg_1", now, body);
  expect(() => verifyDodoWebhook(body, headers(`v1,${sig}`), secret, now)).not.toThrow();
  expect(() => verifyDodoWebhook(body, headers(`v1,AAAA v1,${sig}`), secret, now)).not.toThrow();
});

test("rejects a tampered body", () => {
  const sig = sign("msg_1", now, body);
  expect(() => verifyDodoWebhook(body + " ", headers(`v1,${sig}`), secret, now)).toThrow(DodoWebhookVerificationError);
});

test("rejects a stale timestamp", () => {
  const old = now - 10 * 60;
  const sig = sign("msg_1", old, body);
  expect(() => verifyDodoWebhook(body, headers(`v1,${sig}`, old), secret, now)).toThrow(/tolerance/);
});

test("rejects missing headers", () => {
  expect(() => verifyDodoWebhook(body, {}, secret, now)).toThrow(/missing/);
});

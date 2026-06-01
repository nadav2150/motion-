import { expect, test } from "vitest";
import { classifyOrder, extractUserIdHint } from "./webhook-classify";

test("classifyOrder: one-time order (no subscription) is a credit pack", () => {
  expect(classifyOrder({ subscription_id: null, billing_reason: "purchase" }))
    .toBe("credit_pack");
});

test("classifyOrder: subscription cycle is a renewal", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_cycle" }))
    .toBe("renewal");
});

test("classifyOrder: subscription create is skipped (handled by subscription.created)", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_create" }))
    .toBe("skip");
});

test("classifyOrder: subscription update bill is skipped", () => {
  expect(classifyOrder({ subscription_id: "sub_1", billing_reason: "subscription_update" }))
    .toBe("skip");
});

test("extractUserIdHint prefers metadata.userId, then customer.external_id", () => {
  expect(extractUserIdHint({ metadata: { userId: "u1" }, customer: { external_id: "u2" } }))
    .toBe("u1");
  expect(extractUserIdHint({ metadata: {}, customer: { external_id: "u2" } }))
    .toBe("u2");
  expect(extractUserIdHint({})).toBeNull();
});

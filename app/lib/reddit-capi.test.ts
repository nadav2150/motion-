import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRedditEvent,
  matchKeysFromMetadata,
  matchKeysToMetadata,
  normalizeEmail,
  reportRedditPurchase,
} from "./reddit-capi";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn() }));

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("normalizeEmail", () => {
  it("matches Reddit's documented canonical form and hash", () => {
    expect(normalizeEmail("Al.ice+Apple@Example.Com")).toBe("alice@example.com");
    expect(sha256(normalizeEmail("Al.ice+Apple@Example.Com"))).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
    );
  });
});

describe("buildRedditEvent", () => {
  it("builds a v3 PURCHASE event with hashed identity keys", () => {
    const ev = buildRedditEvent(
      {
        type: "PURCHASE",
        conversionId: "checkout:abc",
        value: 29,
        currency: "usd",
        match: { email: "a@b.co", externalId: "user-1", clickId: "cid", uuid: "u", ip: "1.2.3.4", userAgent: "UA" },
      },
      1700000000000,
    );
    expect(ev).toEqual({
      event_at: 1700000000000,
      action_source: "WEBSITE",
      type: { tracking_type: "PURCHASE" },
      click_id: "cid",
      user: {
        email: sha256("a@b.co"),
        external_id: sha256("user-1"),
        uuid: "u",
        ip_address: "1.2.3.4",
        user_agent: "UA",
      },
      metadata: { conversion_id: "checkout:abc", value: 29, currency: "USD", item_count: 1 },
    });
  });

  it("omits absent keys and value", () => {
    const ev = buildRedditEvent({ type: "SIGN_UP", conversionId: "signup:1", match: {} }, 1);
    expect(ev).toEqual({
      event_at: 1,
      action_source: "WEBSITE",
      type: { tracking_type: "SIGN_UP" },
      user: {},
      metadata: { conversion_id: "signup:1" },
    });
  });
});

describe("checkout metadata round-trip", () => {
  it("carries only present match keys", () => {
    const meta = matchKeysToMetadata({ clickId: "cid", uuid: null, ip: "1.2.3.4", userAgent: "" });
    expect(meta).toEqual({ rdtCid: "cid", rdtIp: "1.2.3.4" });
    expect(matchKeysFromMetadata({ ...meta, userId: "x" })).toEqual({ clickId: "cid", ip: "1.2.3.4" });
  });
});

describe("reportRedditPurchase", () => {
  const insert = vi.fn();
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: () => ({ insert }) } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    process.env.REDDIT_CAPI_TOKEN = "t";
  });

  const base = {
    metadata: { rdtConv: "conv-1", rdtCid: "cid" },
    amountCents: 2900,
    currency: "USD",
    email: "a@b.co",
    externalId: "u1",
  };

  it("sends PURCHASE once with the checkout's conversion id and value", async () => {
    await reportRedditPurchase(base);
    expect(insert).toHaveBeenCalledWith({ event_id: "reddit_purchase:conv-1", event_type: "reddit.purchase" });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.data.events[0]).toMatchObject({
      type: { tracking_type: "PURCHASE" },
      click_id: "cid",
      metadata: { conversion_id: "conv-1", value: 29, currency: "USD" },
    });
  });

  it("skips repeats (renewals inheriting the checkout metadata)", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    await reportRedditPurchase(base);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips payments without our conversion id and $0 trial starts", async () => {
    await reportRedditPurchase({ ...base, metadata: {} });
    await reportRedditPurchase({ ...base, amountCents: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

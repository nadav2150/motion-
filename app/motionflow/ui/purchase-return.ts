// After money changes hands — a return from hosted checkout (?upgraded= /
// ?purchased=) or an in-place plan switch — the webhook can land a few seconds
// after the user is back. Poll /api/me/usage until the new plan or credits show
// up, then celebrate and refresh every usage consumer.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { PACKS, PLANS, formatCredits, isPack, isTier } from "../../lib/billing/catalog";
import { track } from "../../lib/analytics";
import { rdtTrack } from "../../lib/reddit-pixel";
import { getUsageSnapshot, refreshUsage } from "./usage-store";
import { toast } from "./Toast";
import { celebrate } from "./celebrate";

export type PurchaseExpectation =
  | { kind: "plan"; tier: "starter" | "pro" | "studio" }
  | { kind: "pack"; pack: "small" | "medium" | "large" };

const POLL_MS = 2000;
const TIMEOUT_MS = 30_000;

// Resolves true when the purchase is visible in usage, false on timeout.
export async function awaitPurchase(expect: PurchaseExpectation): Promise<boolean> {
  const startBalance = getUsageSnapshot()?.creditsBalance ?? null;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const u = await refreshUsage();
    if (u) {
      if (expect.kind === "plan" && u.planTier === expect.tier) return true;
      if (expect.kind === "pack" && startBalance !== null && u.creditsBalance > startBalance) return true;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return false;
}

export function successMessage(expect: PurchaseExpectation): string {
  if (expect.kind === "plan") {
    const p = PLANS[expect.tier];
    return `Welcome to ${p.label}! Your plan is active.`;
  }
  return `+${formatCredits(PACKS[expect.pack].credits)} credits added. Keep creating!`;
}

export async function confirmPurchase(expect: PurchaseExpectation): Promise<void> {
  const ok = await awaitPurchase(expect);
  if (ok) {
    celebrate();
    toast(successMessage(expect), "success");
  } else {
    toast("Payment received — your credits will appear in a moment.", "info");
  }
}

// Mounted in AppShell: handles the hosted-checkout return URL once.
export function usePurchaseReturn() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const upgraded = params.get("upgraded");
    const purchased = params.get("purchased");
    if (!upgraded && !purchased) return;

    let expect: PurchaseExpectation | null = null;
    if (isTier(upgraded)) expect = { kind: "plan", tier: upgraded };
    else if (purchased?.startsWith("pack_") && isPack(purchased.slice(5))) {
      expect = { kind: "pack", pack: purchased.slice(5) as "small" | "medium" | "large" };
    }

    params.delete("upgraded");
    params.delete("purchased");
    params.delete("pack");
    const source = params.get("source");
    params.delete("source");
    const checkoutId = params.get("checkout_id");
    params.delete("checkout_id");
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });

    if (!expect) return;
    track("purchase_completed_client", {
      kind: expect.kind,
      tier: expect.kind === "plan" ? expect.tier : null,
      pack: expect.kind === "pack" ? expect.pack : null,
      source,
    });
    // Same conversion_id as the order.paid CAPI event → Reddit dedupes.
    if (checkoutId) rdtTrack("Purchase", { conversionId: `checkout:${checkoutId}` });
    void confirmPurchase(expect);
    // Run once per landing; the params are stripped above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Global upsell entry point. Any screen calls openUpsell(trigger, context) —
// same fire-and-forget pattern as toast() — and <UpsellHost/> (mounted once in
// AppShell) renders the UpgradeModal. Server-side gating stays authoritative;
// these are prompts at the moment a user hits a wall.

import { useEffect, useState } from "react";
import { ApiError } from "./api";
import { UpgradeModal } from "./UpgradeModal";

export type UpsellTrigger =
  | "insufficient_credits"
  | "export_4k"
  | "watermark"
  | "duration"
  | "voiceover"
  | "prompt_length"
  | "low_credit_banner"
  | "plan_widget"
  | "first_preview";

export type UpsellContext = {
  needed?: number;
  balance?: number;
  // duration trigger: the length the user asked for, in seconds.
  seconds?: number;
  // where in the UI the prompt was raised (analytics).
  surface?: string;
};

export type UpsellRequest = { trigger: UpsellTrigger; context: UpsellContext };

const listeners = new Set<(r: UpsellRequest) => void>();

export function openUpsell(trigger: UpsellTrigger, context: UpsellContext = {}) {
  const r = { trigger, context };
  listeners.forEach((l) => l(r));
}

// For API calls that may be refused for credits: opens the upsell on a 402 and
// returns true, so the caller can skip its generic error toast.
export function handlePaymentRequired(err: unknown, surface: string): boolean {
  if (!(err instanceof ApiError) || !err.isPaymentRequired) return false;
  const needed = Number(err.body.needed);
  const balance = Number(err.body.balance);
  openUpsell("insufficient_credits", {
    needed: Number.isFinite(needed) ? needed : undefined,
    balance: Number.isFinite(balance) ? balance : undefined,
    surface,
  });
  return true;
}

export function UpsellHost() {
  const [req, setReq] = useState<UpsellRequest | null>(null);
  useEffect(() => {
    listeners.add(setReq);
    return () => {
      listeners.delete(setReq);
    };
  }, []);
  return <UpgradeModal request={req} onClose={() => setReq(null)} />;
}

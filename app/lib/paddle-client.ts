// Client-side Paddle.js bootstrap. SSR-safe: getPaddle() short-circuits to
// undefined on the server. The promise is cached per browser session so we
// only initialize Paddle.js once even if multiple components mount.

import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddle(): Promise<Paddle | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  if (!paddlePromise) {
    const environment = (import.meta.env.VITE_PADDLE_ENV ?? "sandbox") as "sandbox" | "production";
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
    if (!token) {
      console.error("[paddle-client] VITE_PADDLE_CLIENT_TOKEN is missing — Paddle.js will not initialize.");
      return Promise.resolve(undefined);
    }
    paddlePromise = initializePaddle({ environment, token });
  }
  return paddlePromise;
}

export type CheckoutOpenArgs = {
  // Primary price (subscription, or one-off when there's no companion item).
  priceId: string;
  // Optional extra line items added to the same Paddle cart. Used by the
  // pricing-page slider to attach a credit pack to the subscription so the
  // user pays both in a single transaction.
  extraItems?: Array<{ priceId: string; quantity?: number }>;
  customerId: string;
  customData: Record<string, unknown>;
  successUrl?: string;
  // Inline-mode opts. Pass `frameTarget` (CSS class name, no leading dot) on
  // an element you've already rendered to embed the iframe instead of opening
  // a modal overlay. frameStyle is required by Paddle.js when inline; we
  // default to a transparent-bordered full-width box that inherits our chrome.
  displayMode?: "overlay" | "inline";
  frameTarget?: string;
  frameInitialHeight?: number;
  frameStyle?: string;
};

const DEFAULT_INLINE_FRAME_STYLE =
  "width: 100%; min-width: 312px; background-color: transparent; border: none;";

// Open Paddle checkout with one primary price (typically a subscription) plus
// optional extra items (credit packs, etc.). Customer is pre-resolved (we
// minted them server-side via /api/billing/customer) so the flow skips
// Paddle's email-collection step.
//
// Overlay mode opens a modal; inline mode mounts an iframe into the element
// whose class matches `frameTarget`.
export async function openPaddleCheckout(args: CheckoutOpenArgs): Promise<void> {
  const paddle = await getPaddle();
  if (!paddle) throw new Error("Paddle.js not available");

  const displayMode = args.displayMode ?? "overlay";
  const items = [
    { priceId: args.priceId, quantity: 1 },
    ...(args.extraItems ?? []).map((it) => ({
      priceId: it.priceId,
      quantity: it.quantity ?? 1,
    })),
  ];
  // Paddle.js: when `customer.id` is set, `email` is forbidden (typed as never)
  // because the id already implies the email on Paddle's side.
  paddle.Checkout.open({
    items,
    customer: { id: args.customerId },
    customData: args.customData,
    settings: {
      displayMode,
      theme: "dark",
      successUrl: args.successUrl,
      ...(displayMode === "inline"
        ? {
            frameTarget: args.frameTarget ?? "mf-paddle-frame",
            frameInitialHeight: args.frameInitialHeight ?? 450,
            frameStyle: args.frameStyle ?? DEFAULT_INLINE_FRAME_STYLE,
          }
        : {}),
    },
  });
}

// Stable class name the screen uses on the iframe container.
export const PADDLE_INLINE_FRAME_CLASS = "mf-paddle-frame";

// Per-tier price lookup from Vite-exposed env. Returned ids feed straight
// into openPaddleCheckout.
export function priceIdForTier(tier: "starter" | "pro" | "studio"): string | undefined {
  switch (tier) {
    case "starter":
      return import.meta.env.VITE_PADDLE_PRICE_STARTER as string | undefined;
    case "pro":
      return import.meta.env.VITE_PADDLE_PRICE_PRO as string | undefined;
    case "studio":
      return import.meta.env.VITE_PADDLE_PRICE_STUDIO as string | undefined;
  }
}

export function priceIdForPack(size: "small" | "medium" | "large"): string | undefined {
  switch (size) {
    case "small":
      return import.meta.env.VITE_PADDLE_PRICE_PACK_SMALL as string | undefined;
    case "medium":
      return import.meta.env.VITE_PADDLE_PRICE_PACK_MEDIUM as string | undefined;
    case "large":
      return import.meta.env.VITE_PADDLE_PRICE_PACK_LARGE as string | undefined;
  }
}

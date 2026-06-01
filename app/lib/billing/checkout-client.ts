// Client-side checkout: ask our server for a Polar hosted-checkout URL, then
// redirect the browser to it. Replaces the Paddle.js overlay. Product ids stay
// server-side — the browser only sends the chosen tier/pack.

export type StartCheckoutArgs = {
  tier: "starter" | "pro" | "studio";
  pack?: "small" | "medium" | "large" | null;
};

export async function startCheckout(args: StartCheckoutArgs): Promise<void> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: args.tier, pack: args.pack ?? null }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Checkout failed (${res.status})`);
  }
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error("Checkout response missing url");
  window.location.href = url;
}

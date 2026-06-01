// Pure helpers for the Polar webhook handler — no I/O, unit tested.

export type OrderShape = {
  subscription_id?: string | null;
  billing_reason?: string | null;
};

export type OrderClass = "credit_pack" | "renewal" | "skip";

// Decide what an order.paid event means for the ledger.
// - no subscription_id      → one-time credit pack purchase
// - subscription_cycle      → renewal (grant the next monthly batch)
// - subscription_create/... → skip (subscription.created already granted)
export function classifyOrder(order: OrderShape): OrderClass {
  if (!order.subscription_id) return "credit_pack";
  if (order.billing_reason === "subscription_cycle") return "renewal";
  return "skip";
}

// Best-effort userId hint from a webhook payload: our metadata first, then the
// customer's external_id (which we set to the Supabase user id at checkout).
export function extractUserIdHint(data: {
  metadata?: { userId?: unknown } | null;
  customer?: { external_id?: unknown } | null;
}): string | null {
  const fromMeta = data.metadata?.userId;
  if (typeof fromMeta === "string" && fromMeta) return fromMeta;
  const fromExternal = data.customer?.external_id;
  if (typeof fromExternal === "string" && fromExternal) return fromExternal;
  return null;
}

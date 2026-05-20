// POST /api/billing/customer — idempotent. Looks up the Paddle customer for
// the signed-in user (from user_billing.paddle_customer_id). If absent,
// creates one via Paddle (or reuses an existing Paddle customer with the same
// email), then writes the id back to user_billing.
//
// Frontend calls this once before opening the Paddle.js overlay so the
// checkout opens against a known customer (skipping Paddle's email step) and
// custom_data on the transaction can carry our userId.

import type { Route } from "./+types/api.billing.customer";
import { requireUserApi } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { getOrCreatePaddleCustomer } from "../lib/billing/paddle";
import { getOrCreateBilling } from "../lib/billing/credits";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { user, headers } = await requireUserApi(request);
  if (!user.email) {
    return Response.json({ error: "Account is missing an email" }, { status: 400 });
  }

  const db = getSupabase();
  const billing = await getOrCreateBilling(user.id);

  if (billing.paddle_customer_id) {
    return Response.json(
      { customerId: billing.paddle_customer_id, email: user.email },
      { headers },
    );
  }

  const customer = await getOrCreatePaddleCustomer(user.email, user.name ?? undefined);

  const { error } = await db
    .from("user_billing")
    .update({ paddle_customer_id: customer.id })
    .eq("user_id", user.id);
  if (error) {
    console.error(`[billing] failed to save paddle_customer_id for ${user.id}: ${error.message}`);
    return Response.json({ error: "Failed to persist customer" }, { status: 500, headers });
  }

  return Response.json({ customerId: customer.id, email: customer.email }, { headers });
}

export function loader() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}

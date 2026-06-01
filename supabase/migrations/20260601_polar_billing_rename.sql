-- Rename Paddle-specific billing identifiers to provider-neutral names as part
-- of the Paddle -> Polar migration. No data to preserve (Paddle never went
-- live), but renames keep PKs/indexes intact.

alter table user_billing    rename column paddle_customer_id     to provider_customer_id;

alter table subscriptions   rename column paddle_subscription_id to provider_subscription_id;
alter table subscriptions   rename column paddle_price_id        to provider_product_id;

alter table credit_purchases rename column paddle_transaction_id to provider_order_id;
alter table credit_purchases rename column paddle_price_id       to provider_product_id;

-- Rename the webhook idempotency table.
alter table paddle_events rename to billing_events;

-- Recreate the RLS policy under the new table name.
drop policy if exists "service_role full access on paddle_events" on billing_events;
create policy "service_role full access on billing_events"
  on billing_events for all to service_role
  using (true) with check (true);

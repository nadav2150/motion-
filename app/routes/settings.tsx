import { data, useLoaderData, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/settings";
import {
  SettingsScreen,
  type SettingsAccount,
  type SettingsBilling,
  type SettingsSubscription,
} from "../motionflow/screens/settings";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { getOrCreateBilling } from "../lib/billing/credits";
import { getSupabase } from "../lib/supabase";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Settings — Videly AI" }];
}

type LoaderData = {
  account: SettingsAccount;
  billing: SettingsBilling;
  subscription: SettingsSubscription | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserOrRedirect(request);
  const billing = await getOrCreateBilling(user.id);

  const db = getSupabase();
  const { data: subRow } = await db
    .from("subscriptions")
    .select("provider_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subscription: SettingsSubscription | null = subRow
    ? {
        status: (subRow.status as string) ?? "active",
        cancelAtPeriodEnd: Boolean(subRow.cancel_at_period_end),
        currentPeriodEnd: (subRow.current_period_end as string | null) ?? null,
      }
    : null;

  return data(
    {
      account: { id: user.id, name: user.name, email: user.email },
      billing: {
        planTier: billing.plan_tier,
        creditsBalance: billing.credits_balance,
        creditsReserved: billing.credits_reserved,
        monthlyGrant: billing.monthly_grant,
        periodEnd: billing.period_end,
      },
      subscription,
    } satisfies LoaderData,
    { headers },
  );
}

const navPath: Record<NavKey, string> = {
  home: "/home",
  projects: "/projects",
  settings: "/settings",
};

export default function SettingsRoute() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { account, billing, subscription } = useLoaderData() as LoaderData;
  return (
    <SettingsScreen
      account={account}
      billing={billing}
      subscription={subscription}
      onNav={(k) => navigate(navPath[k])}
      onManagePlan={() => navigate("/pricing")}
      onSubscriptionChanged={() => revalidator.revalidate()}
    />
  );
}

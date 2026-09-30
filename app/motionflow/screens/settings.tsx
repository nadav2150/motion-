// /settings — Account, Plans (billing), Preferences, Notifications, Integrations.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowRight, Cloud, Crown, Lock, Moon, Monitor, Plug, Share2, Sun, Webhook } from "lucide-react";
import { AppShell } from "../ui/AppShell";
import { Button, ButtonLink } from "../ui/Button";
import { Select, Tabs, Toggle } from "../ui/controls";
import { Badge, Card, CardHeader, PageHeader, ProgressBar } from "../ui/Card";
import { ConfirmModal } from "../ui/Modal";
import { toast } from "../ui/Toast";
import { cn, formatNumber } from "../ui/format";
import { readPrefs, writePrefs, type Prefs } from "../ui/prefs";
import { LANGUAGES } from "../ui/languages";
import { DURATION_OPTIONS } from "../../lib/studio/types";

export type SettingsAccount = {
  id: string;
  name: string | null;
  email: string | null;
};

export type SettingsBilling = {
  planTier: string;
  creditsBalance: number;
  creditsReserved: number;
  monthlyGrant: number;
  periodEnd: string | null;
};

export type SettingsSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

type TabKey = "account" | "plans" | "preferences" | "notifications" | "integrations";
const TABS: { key: TabKey; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "plans", label: "Plans" },
  { key: "preferences", label: "Preferences" },
  { key: "notifications", label: "Notifications" },
  { key: "integrations", label: "Integrations" },
];

const PLAN_DISPLAY: Record<string, { name: string; monthlyUsd: number }> = {
  free: { name: "Free", monthlyUsd: 0 },
  starter: { name: "Starter", monthlyUsd: 19 },
  pro: { name: "Pro", monthlyUsd: 49 },
  studio: { name: "Studio", monthlyUsd: 149 },
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-t border-slate/35 py-3.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[13px] font-medium text-silver">{label}</dt>
      <dd className={cn("min-w-0 truncate text-sm text-paper", mono && "font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate/40 bg-ink-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-silver">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-paper">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-silver">{sub}</p>}
    </div>
  );
}

export const SettingsScreen = ({
  account,
  billing,
  subscription,
  onSubscriptionChanged,
}: {
  account: SettingsAccount;
  billing: SettingsBilling;
  subscription: SettingsSubscription | null;
  onSubscriptionChanged?: () => void;
}) => {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "account") as TabKey;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => setPrefs(readPrefs()), []);
  const updatePrefs = (p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...(cur ?? readPrefs()), ...p };
      writePrefs(next);
      return next;
    });
    toast("Preferences saved");
  };

  const plan = PLAN_DISPLAY[billing.planTier] ?? PLAN_DISPLAY.free!;
  const renewal = formatDate(billing.periodEnd);
  const subscriptionEnds = formatDate(subscription?.currentPeriodEnd ?? null);
  const canCancel = subscription !== null && !subscription.cancelAtPeriodEnd && billing.planTier !== "free";
  const initials = (account.name?.trim() || account.email || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch("/api/billing/cancel-subscription", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Cancel failed (${res.status})`);
      }
      setConfirmingCancel(false);
      toast("Your subscription will not renew");
      onSubscriptionChanged?.();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AppShell
      user={{ id: account.id, name: account.name, email: account.email }}
      planTier={billing.planTier}
      credits={billing.creditsBalance}
    >
      <PageHeader title="Settings" subtitle="Manage your account, plan and preferences." />
      <Tabs
        label="Settings sections"
        items={TABS}
        value={tab}
        onChange={(k) => {
          const p = new URLSearchParams(params);
          p.set("tab", k);
          setParams(p, { replace: true });
        }}
        className="mb-6"
      />

      <div className="max-w-3xl space-y-5">
        {tab === "account" && (
          <Card className="p-5 sm:p-6">
            <CardHeader title="Profile" subtitle="Your Videly identity. Contact support to change your email." />
            <div className="mb-4 flex items-center gap-4">
              <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-coral to-[#c9643d] text-xl font-bold text-white">
                {initials || "?"}
              </span>
              <div>
                <p className="text-sm font-semibold text-paper">Profile photo</p>
                <p className="mt-0.5 text-xs text-silver">Photo uploads are coming soon — we use your initials for now.</p>
              </div>
            </div>
            <dl>
              <Field label="Name" value={account.name || "—"} />
              <Field label="Email" value={account.email || "—"} />
              <Field label="Account ID" value={account.id.length > 14 ? `${account.id.slice(0, 4)}…${account.id.slice(-8)}` : account.id} mono />
            </dl>
          </Card>
        )}

        {tab === "plans" && (
          <>
            <Card className="p-5 sm:p-6">
              <CardHeader
                title="Plan"
                subtitle="Your current Videly subscription."
                action={
                  <ButtonLink
                    to="/pricing"
                    variant={billing.planTier === "free" ? "primary" : "secondary"}
                    size="sm"
                    iconRight={<ArrowRight className="size-3.5" aria-hidden />}
                  >
                    {billing.planTier === "free" ? "Upgrade" : "Change plan"}
                  </ButtonLink>
                }
              />
              <div className="flex items-baseline gap-3 border-t border-slate/35 py-4">
                <Badge tone="coral" className="self-center">
                  <Crown className="size-3" aria-hidden /> {plan.name.toUpperCase()}
                </Badge>
                <span className="text-3xl font-bold text-paper">${plan.monthlyUsd}</span>
                <span className="text-sm text-silver">/month</span>
              </div>
              <dl>
                {subscription?.cancelAtPeriodEnd ? (
                  <Field label="Ends" value={`${subscriptionEnds || renewal || "End of current period"} · will not renew`} />
                ) : renewal ? (
                  <Field label="Renews" value={renewal} />
                ) : null}
              </dl>
              {canCancel && (
                <div className="flex justify-end border-t border-slate/35 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError(null);
                      setConfirmingCancel(true);
                    }}
                    className="rounded-md px-1 text-sm font-medium text-danger hover:underline"
                  >
                    Cancel subscription
                  </button>
                </div>
              )}
            </Card>
            <Card className="p-5 sm:p-6">
              <CardHeader title="Credits" subtitle="Spent on generation, edits, voiceovers and exports." />
              {billing.monthlyGrant > 0 && (
                <ProgressBar value={billing.creditsBalance / billing.monthlyGrant} className="mb-4 h-2" label="Credits remaining" />
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Balance" value={formatNumber(billing.creditsBalance)} sub="Available right now" />
                <Stat
                  label="Monthly grant"
                  value={formatNumber(billing.monthlyGrant)}
                  sub={billing.planTier === "free" ? "Free tier allowance" : "Renews with your plan"}
                />
                <Stat label="Reserved" value={formatNumber(billing.creditsReserved)} sub="Held by videos in progress" />
              </div>
            </Card>
          </>
        )}

        {tab === "preferences" && prefs && (
          <Card className="p-5 sm:p-6">
            <CardHeader title="Preferences" subtitle="Saved on this device." />
            <fieldset>
              <legend className="text-[13px] font-medium text-silver">Theme</legend>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {[
                  { k: "dark", label: "Dark", icon: Moon, enabled: true },
                  { k: "light", label: "Light", icon: Sun, enabled: false },
                  { k: "system", label: "System", icon: Monitor, enabled: false },
                ].map(({ k, label, icon: Icon, enabled }) => (
                  <label
                    key={k}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm",
                      enabled ? "cursor-pointer border-coral bg-coral/10 text-paper" : "cursor-not-allowed border-slate/40 text-silver/60",
                    )}
                  >
                    <input type="radio" name="theme" value={k} checked={k === "dark"} disabled={!enabled} readOnly className="sr-only" />
                    <Icon className="size-5" aria-hidden />
                    {label}
                    {!enabled && <span className="text-[10.5px]">Coming soon</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Select
                label="Default language"
                hideLabel={false}
                value={prefs.language}
                onChange={(v) => updatePrefs({ language: v })}
                options={LANGUAGES}
              />
              <Select
                label="Default video duration"
                hideLabel={false}
                value={String(prefs.defaultDuration)}
                onChange={(v) => updatePrefs({ defaultDuration: Number(v) })}
                options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: `${d} seconds` }))}
              />
            </div>
          </Card>
        )}

        {tab === "notifications" && prefs && (
          <Card className="p-5 sm:p-6">
            <CardHeader title="Notifications" subtitle="Choose what we email you about." />
            <div className="divide-y divide-slate/35">
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-paper">Video ready</p>
                  <p className="text-xs text-silver">When a video or export finishes.</p>
                </div>
                <Toggle checked={prefs.notifyReady} onChange={(v) => updatePrefs({ notifyReady: v })} label="Email me when a video is ready" />
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-paper">Product updates</p>
                  <p className="text-xs text-silver">New templates and features, at most twice a month.</p>
                </div>
                <Toggle checked={prefs.notifyProduct} onChange={(v) => updatePrefs({ notifyProduct: v })} label="Email me product updates" />
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-paper">Billing</p>
                  <p className="text-xs text-silver">Receipts and payment problems are always sent.</p>
                </div>
                <Lock className="size-4 text-silver" aria-label="Always on" />
              </div>
            </div>
          </Card>
        )}

        {tab === "integrations" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { name: "Publish to social", body: "Send finished videos straight to your channels.", icon: Share2 },
              { name: "Cloud storage", body: "Save exports to your cloud drive automatically.", icon: Cloud },
              { name: "Webhooks", body: "Get notified in your tools when a video is ready.", icon: Webhook },
              { name: "API access", body: "Generate videos from your own product.", icon: Plug },
            ].map(({ name, body, icon: Icon }) => (
              <Card key={name} className="p-5">
                <div className="flex items-start gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate/40 text-silver">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-paper">{name}</p>
                      <Badge>Coming soon</Badge>
                    </div>
                    <p className="mt-1 text-xs text-silver">{body}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="mt-4" disabled>
                  Connect
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmingCancel}
        onClose={() => !cancelling && setConfirmingCancel(false)}
        onConfirm={() => void handleCancel()}
        busy={cancelling}
        confirmLabel="Confirm cancel"
        title="Cancel subscription?"
        body={
          <>
            Your {plan.name} plan stays active until{" "}
            <span className="text-paper">{subscriptionEnds || renewal || "the end of the current billing period"}</span>. After that,
            you'll move to Free and lose paid features.
            {cancelError && <span className="mt-3 block rounded-lg bg-danger/10 px-3 py-2 text-danger">{cancelError}</span>}
          </>
        }
      />
    </AppShell>
  );
};

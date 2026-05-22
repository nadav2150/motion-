import { useState } from "react";
import {
  AppChrome,
  Button,
  Glass,
  IconArrowRight,
  type NavKey,
} from "../primitives";

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

type SectionKey = "general" | "billing";

const PLAN_DISPLAY: Record<string, { name: string; monthlyUsd: number; accent: string }> = {
  free:    { name: "Free",    monthlyUsd: 0,   accent: "#9CA3AF" },
  starter: { name: "Starter", monthlyUsd: 19,  accent: "#7AA2FF" },
  pro:     { name: "Pro",     monthlyUsd: 49,  accent: "#A78BFA" },
  studio:  { name: "Studio",  monthlyUsd: 149, accent: "#67E8F9" },
};

function planDisplay(tier: string) {
  return PLAN_DISPLAY[tier] ?? PLAN_DISPLAY.free;
}

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}…${id.slice(-8)}`;
}

function formatRenewal(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const DisplayRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)" }}>
    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", paddingTop: 2 }}>
      {label.toUpperCase()}
    </div>
    <div
      className={mono ? "mf-mono" : undefined}
      style={{ fontSize: 13.5, color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {value}
    </div>
  </div>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", marginBottom: 10 }}>
      {label.toUpperCase()}
    </div>
    <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--ink-0)", lineHeight: 1 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{sub}</div>}
  </div>
);

export const SettingsScreen = ({
  onNav,
  account,
  billing,
  subscription,
  onManagePlan,
  onSubscriptionChanged,
}: {
  onNav?: (k: NavKey) => void;
  account: SettingsAccount;
  billing: SettingsBilling;
  subscription: SettingsSubscription | null;
  onManagePlan?: () => void;
  onSubscriptionChanged?: () => void;
}) => {
  const [section, setSection] = useState<SectionKey>("general");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const sections: Array<{ k: SectionKey; t: string }> = [
    { k: "general", t: "General" },
    { k: "billing", t: "Billing" },
  ];

  const plan = planDisplay(billing.planTier);
  const renewal = formatRenewal(billing.periodEnd);
  const subscriptionEnds = formatRenewal(subscription?.currentPeriodEnd ?? null);
  const canCancel =
    subscription !== null &&
    !subscription.cancelAtPeriodEnd &&
    billing.planTier !== "free";

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
      onSubscriptionChanged?.();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <AppChrome
      active="settings"
      onNav={onNav}
      project="Settings"
      credits={billing.creditsBalance}
    >
      <div className="mf-bg-bloom"/>
      <div style={{ position: "relative", padding: "48px 56px 80px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div className="mf-eyebrow" style={{ marginBottom: 12 }}>SETTINGS</div>
          <h1 className="mf-h1" style={{ margin: 0, fontSize: 40 }}>Account & billing</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 40 }}>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sections.map((s) => (
              <button
                key={s.k}
                onClick={() => setSection(s.k)}
                style={{
                  padding: "10px 14px", borderRadius: 10, textAlign: "left", fontFamily: "inherit",
                  background: section === s.k ? "rgba(122,162,255,0.06)" : "transparent",
                  border: `1px solid ${section === s.k ? "rgba(122,162,255,0.25)" : "transparent"}`,
                  color: section === s.k ? "var(--ink-0)" : "var(--ink-2)",
                  fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 200ms",
                }}
              >
                {s.t}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {section === "general" && (
              <Glass style={{ padding: 28 }}>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Account</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
                    Your Videly identity. Contact support to change your email.
                  </div>
                </div>
                <DisplayRow label="Name" value={account.name || "—"}/>
                <DisplayRow label="Email" value={account.email || "—"}/>
                <DisplayRow label="Account ID" value={shortId(account.id)} mono/>
              </Glass>
            )}

            {section === "billing" && (
              <>
                <Glass style={{ padding: 28 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22 }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Plan</div>
                      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>Your current Videly subscription.</div>
                    </div>
                    <Button
                      variant={billing.planTier === "free" ? "primary" : "ghost"}
                      size="sm"
                      onClick={onManagePlan}
                      iconRight={<IconArrowRight size={12}/>}
                    >
                      {billing.planTier === "free" ? "Upgrade" : "Change plan"}
                    </Button>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "20px 0", borderTop: "1px solid var(--line)" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: "0.04em",
                        color: plan.accent,
                        background: `${plan.accent}14`,
                        border: `1px solid ${plan.accent}30`,
                      }}
                    >
                      {plan.name.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--ink-0)", lineHeight: 1 }}>
                      ${plan.monthlyUsd}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--ink-3)" }}>/month</span>
                  </div>

                  {subscription?.cancelAtPeriodEnd ? (
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)" }}>
                      <div className="mf-mono" style={{ fontSize: 10, color: "#FCA5A5", letterSpacing: "0.1em", paddingTop: 2 }}>
                        ENDS
                      </div>
                      <div style={{ fontSize: 13.5, color: "var(--ink-0)" }}>
                        {subscriptionEnds || renewal || "End of current period"}
                        <span style={{ marginLeft: 10, fontSize: 12, color: "var(--ink-3)" }}>
                          · subscription will not renew
                        </span>
                      </div>
                    </div>
                  ) : renewal ? (
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)" }}>
                      <div className="mf-mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", paddingTop: 2 }}>
                        RENEWS
                      </div>
                      <div style={{ fontSize: 13.5, color: "var(--ink-0)" }}>{renewal}</div>
                    </div>
                  ) : null}

                  {canCancel && (
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                      <button
                        type="button"
                        onClick={() => { setCancelError(null); setConfirmingCancel(true); }}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "#FCA5A5",
                          fontSize: 13,
                          fontFamily: "inherit",
                          fontWeight: 500,
                          cursor: "pointer",
                          padding: "6px 2px",
                        }}
                      >
                        Cancel subscription
                      </button>
                    </div>
                  )}
                </Glass>

                <Glass style={{ padding: 28 }}>
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.015em" }}>Credits</div>
                    <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
                      Spent across renders, vision critique, audio, and image generation.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 24, padding: "20px 0", borderTop: "1px solid var(--line)" }}>
                    <Stat
                      label="Balance"
                      value={billing.creditsBalance.toLocaleString()}
                      sub="Available right now"
                    />
                    <Stat
                      label="Monthly grant"
                      value={billing.monthlyGrant.toLocaleString()}
                      sub={billing.planTier === "free" ? "Free tier allowance" : "Renews with your plan"}
                    />
                    <Stat
                      label="Reserved"
                      value={billing.creditsReserved.toLocaleString()}
                      sub="Held by in-flight jobs"
                    />
                  </div>
                </Glass>
              </>
            )}
          </div>
        </div>
      </div>

      {confirmingCancel && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!cancelling) setConfirmingCancel(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(4,5,8,0.72)", backdropFilter: "blur(8px)",
            display: "grid", placeItems: "center", padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 440, padding: 28,
              background: "rgba(11,12,16,0.98)", border: "1px solid var(--line)",
              borderRadius: 16, boxShadow: "0 24px 64px -16px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.015em" }}>
              Cancel subscription?
            </div>
            <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              Your {plan.name} plan stays active until{" "}
              <span style={{ color: "var(--ink-0)" }}>{subscriptionEnds || renewal || "the end of the current billing period"}</span>.
              After that, you'll drop to Free and lose paid features.
            </div>
            {cancelError && (
              <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "#FCA5A5", fontSize: 12.5 }}>
                {cancelError}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
              >
                Keep plan
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Confirm cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppChrome>
  );
};

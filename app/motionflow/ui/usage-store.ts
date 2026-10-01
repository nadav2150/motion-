// One shared snapshot of GET /api/me/usage for the whole app shell: the plan
// widget, low-credit banner, upgrade modal and post-purchase polling all read
// it, and refreshUsage() updates every consumer at once (e.g. after a payment
// lands or an export spends credits).

import { useEffect, useState } from "react";
import { api, type UsageInfo } from "./api";

let snapshot: UsageInfo | null = null;
let inflight: Promise<UsageInfo | null> | null = null;
const listeners = new Set<(u: UsageInfo | null) => void>();

function publish(u: UsageInfo | null) {
  snapshot = u;
  listeners.forEach((l) => l(u));
}

export function getUsageSnapshot(): UsageInfo | null {
  return snapshot;
}

export function refreshUsage(): Promise<UsageInfo | null> {
  if (inflight) return inflight;
  inflight = api
    .getUsage()
    .then((u) => {
      publish(u);
      return u;
    })
    .catch(() => snapshot)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// Live usage, seeded from loader data until the first fetch lands.
export function useSharedUsage(fallback: UsageInfo | null): UsageInfo | null {
  const [usage, setUsage] = useState<UsageInfo | null>(snapshot ?? fallback);
  useEffect(() => {
    listeners.add(setUsage);
    if (snapshot) setUsage(snapshot);
    void refreshUsage();
    return () => {
      listeners.delete(setUsage);
    };
  }, []);
  return usage;
}

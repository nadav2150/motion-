// Per-device UI preferences (Settings → Preferences / Notifications). Kept in
// localStorage until there is a server-side profile endpoint.

export type Prefs = {
  language: string;
  defaultDuration: number;
  notifyReady: boolean;
  notifyProduct: boolean;
};

const KEY = "videly:prefs";
export const DEFAULT_PREFS: Prefs = { language: "en", defaultDuration: 30, notifyReady: true, notifyProduct: false };

export function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

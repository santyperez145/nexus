/** Client-side routing defaults shared by Preferences → Playground. */

export type RoutingPrefs = {
  sort: "default" | "price" | "throughput" | "latency";
  allowFallbacks: boolean;
  zdrOnly: boolean;
  only: string;
  ignore: string;
};

export const ROUTING_PREFS_KEY = "nexus_routing_prefs_v1";

export const DEFAULT_ROUTING_PREFS: RoutingPrefs = {
  sort: "default",
  allowFallbacks: true,
  zdrOnly: false,
  only: "",
  ignore: "",
};

export function readRoutingPrefs(): RoutingPrefs {
  if (typeof window === "undefined") return DEFAULT_ROUTING_PREFS;
  try {
    const raw = localStorage.getItem(ROUTING_PREFS_KEY);
    if (!raw) return DEFAULT_ROUTING_PREFS;
    const parsed = JSON.parse(raw) as Partial<RoutingPrefs>;
    return {
      sort: parsed.sort ?? DEFAULT_ROUTING_PREFS.sort,
      allowFallbacks: parsed.allowFallbacks ?? true,
      zdrOnly: parsed.zdrOnly ?? false,
      only: typeof parsed.only === "string" ? parsed.only : "",
      ignore: typeof parsed.ignore === "string" ? parsed.ignore : "",
    };
  } catch {
    return DEFAULT_ROUTING_PREFS;
  }
}

export function writeRoutingPrefs(prefs: RoutingPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ROUTING_PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event("nexus-routing-prefs"));
}

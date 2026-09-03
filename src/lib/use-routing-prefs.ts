"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_ROUTING_PREFS,
  ROUTING_PREFS_KEY,
  readRoutingPrefs,
  writeRoutingPrefs,
  type RoutingPrefs,
} from "@/lib/routing-prefs";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener("nexus-routing-prefs", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("nexus-routing-prefs", handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): RoutingPrefs {
  return readRoutingPrefs();
}

function getServerSnapshot(): RoutingPrefs {
  return DEFAULT_ROUTING_PREFS;
}

/** Shared routing defaults (Preferences ↔ Playground) via localStorage. */
export function useRoutingPrefs(): [RoutingPrefs, (next: RoutingPrefs) => void] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setPrefs = useCallback((next: RoutingPrefs) => {
    writeRoutingPrefs(next);
  }, []);
  return [prefs, setPrefs];
}

export { ROUTING_PREFS_KEY, DEFAULT_ROUTING_PREFS, type RoutingPrefs };

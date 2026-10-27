import { destinationByIata } from "./airports";
import type { WatchedRoute } from "./types";

export const AUTO_INTERVAL_HOURS = [1, 2, 4, 8, 12, 24] as const;
export const DEFAULT_INTERVAL_HOURS = 4;
const SETTINGS_KEY = "krk-fare-tracker.auto-refresh.v1";

export type AutoRefreshSettings = {
  intervalHours: number;
  /** ISO timestamp of the last Ryanair check per route, from any button or the timer. */
  lastChecked: Record<string, string>;
};

const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = JSON.stringify({ intervalHours: DEFAULT_INTERVAL_HOURS, lastChecked: {} });

export function subscribeAutoRefresh(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAutoRefreshSnapshot(): string {
  try {
    return localStorage.getItem(SETTINGS_KEY) ?? SERVER_SNAPSHOT;
  } catch {
    return SERVER_SNAPSHOT;
  }
}

export function getAutoRefreshServerSnapshot(): string {
  return SERVER_SNAPSHOT;
}

export function parseAutoRefresh(raw: string): AutoRefreshSettings {
  try {
    const value = JSON.parse(raw) as Partial<AutoRefreshSettings>;
    const intervalHours = AUTO_INTERVAL_HOURS.includes(value.intervalHours as (typeof AUTO_INTERVAL_HOURS)[number])
      ? (value.intervalHours as number)
      : DEFAULT_INTERVAL_HOURS;
    const lastChecked: Record<string, string> = {};
    if (value.lastChecked && typeof value.lastChecked === "object") {
      for (const [id, at] of Object.entries(value.lastChecked)) {
        if (typeof at === "string" && !Number.isNaN(Date.parse(at))) lastChecked[id] = at;
      }
    }
    return { intervalHours, lastChecked };
  } catch {
    return { intervalHours: DEFAULT_INTERVAL_HOURS, lastChecked: {} };
  }
}

export function readAutoRefresh(): AutoRefreshSettings {
  return parseAutoRefresh(getAutoRefreshSnapshot());
}

function writeAutoRefresh(settings: AutoRefreshSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Without storage the timer still runs; it just forgets the last check after a reload.
  }
  for (const listener of listeners) listener();
}

export function setAutoInterval(intervalHours: number) {
  writeAutoRefresh({ ...readAutoRefresh(), intervalHours });
}

export function recordChecks(routeIds: string[], now: Date = new Date()) {
  const settings = readAutoRefresh();
  const at = now.toISOString();
  writeAutoRefresh({
    ...settings,
    lastChecked: { ...settings.lastChecked, ...Object.fromEntries(routeIds.map((id) => [id, at])) },
  });
}

export function canAutoRefresh(route: WatchedRoute, today: string): boolean {
  if (!destinationByIata.get(route.destinationIata)?.airlines.includes("ryanair")) return false;
  const lastOutbound = route.outboundTo ?? route.outboundFrom;
  if (lastOutbound < today) return false;
  return route.returnDate == null || route.returnDate >= today;
}

/** Routes with the box ticked whose last check is older than the interval. */
export function dueRouteIds(
  routes: WatchedRoute[],
  settings: AutoRefreshSettings,
  today: string,
  now: Date = new Date(),
): string[] {
  const intervalMs = settings.intervalHours * 60 * 60 * 1000;
  return routes
    .filter((route) => route.autoRefresh === true && canAutoRefresh(route, today))
    .filter((route) => {
      const last = settings.lastChecked[route.id];
      return !last || now.getTime() - Date.parse(last) >= intervalMs;
    })
    .map((route) => route.id);
}

export function nextCheckAt(routeId: string, settings: AutoRefreshSettings): Date | null {
  const last = settings.lastChecked[routeId];
  if (!last) return null;
  return new Date(Date.parse(last) + settings.intervalHours * 60 * 60 * 1000);
}

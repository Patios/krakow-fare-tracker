import { lookupDestination } from "./network-refresh";
import type { DayFlights, LegWindow, NoFare, RyanairFare } from "./fare-refresh";
import type { WatchedRoute } from "./types";

export const AUTO_INTERVAL_HOURS = [1, 2, 4, 8, 12, 24] as const;
export const DEFAULT_INTERVAL_HOURS = 4;
const SETTINGS_KEY = "krk-fare-tracker.auto-refresh.v1";

export type AutoRefreshSettings = {
  intervalHours: number;
  /** ISO timestamp of the last Ryanair check per route, from any button or the timer. */
  lastChecked: Record<string, string>;
  /** Routes whose last Ryanair check found no fare, cleared when a fare comes back. */
  noFare: Record<string, NoFare & { trip: string }>;
  /** Every flight on the checked day, per leg, from the last Ryanair check. */
  dayFlights: Record<string, { trip: string; legs: DayFlights[] }>;
};

export function currentDayFlights(route: WatchedRoute, settings: AutoRefreshSettings): DayFlights[] {
  const entry = settings.dayFlights[route.id];
  return entry && entry.trip === tripKey(route) ? entry.legs : [];
}

export function recordDayFlights(route: WatchedRoute, legs: DayFlights[]) {
  const settings = readAutoRefresh();
  const next = { ...settings.dayFlights };
  if (legs.length > 0) next[route.id] = { trip: tripKey(route), legs };
  else if (route.id in next) delete next[route.id];
  else return;
  writeAutoRefresh({ ...settings, dayFlights: next });
}

export function tripKey(route: Pick<WatchedRoute, "outboundFrom" | "outboundTo" | "returnDate">): string {
  return `${route.outboundFrom}|${route.outboundTo ?? ""}|${route.returnDate ?? ""}`;
}

/** The saved no-fare result, only while the route still has the dates it was checked for. */
export function currentNoFare(route: WatchedRoute, settings: AutoRefreshSettings): NoFare | null {
  const entry = settings.noFare[route.id];
  return entry && entry.trip === tripKey(route) ? { missing: entry.missing, available: entry.available } : null;
}

const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = JSON.stringify({ intervalHours: DEFAULT_INTERVAL_HOURS, lastChecked: {}, noFare: {}, dayFlights: {} });

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
    const noFare: AutoRefreshSettings["noFare"] = {};
    if (value.noFare && typeof value.noFare === "object") {
      for (const [id, entry] of Object.entries(value.noFare as Record<string, unknown>)) {
        const parsed = readNoFareEntry(entry);
        if (parsed) noFare[id] = parsed;
      }
    }
    const dayFlights: AutoRefreshSettings["dayFlights"] = {};
    if (value.dayFlights && typeof value.dayFlights === "object") {
      for (const [id, entry] of Object.entries(value.dayFlights as Record<string, unknown>)) {
        const parsed = readDayFlightsEntry(entry);
        if (parsed) dayFlights[id] = parsed;
      }
    }
    return { intervalHours, lastChecked, noFare, dayFlights };
  } catch {
    return { intervalHours: DEFAULT_INTERVAL_HOURS, lastChecked: {}, noFare: {}, dayFlights: {} };
  }
}

function readFare(value: unknown): RyanairFare | null {
  if (!value || typeof value !== "object") return null;
  const fare = value as Partial<RyanairFare>;
  if (typeof fare.amount !== "number" || typeof fare.date !== "string") return null;
  return {
    amount: fare.amount,
    date: fare.date,
    number: typeof fare.number === "string" ? fare.number : "",
    departs: typeof fare.departs === "string" ? fare.departs : null,
    arrives: typeof fare.arrives === "string" ? fare.arrives : null,
  };
}

function readDayFlightsEntry(value: unknown): { trip: string; legs: DayFlights[] } | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as { trip?: unknown; legs?: unknown };
  if (typeof entry.trip !== "string" || !Array.isArray(entry.legs)) return null;
  const legs: DayFlights[] = [];
  for (const raw of entry.legs) {
    if (!raw || typeof raw !== "object") continue;
    const leg = raw as { leg?: unknown; date?: unknown; flights?: unknown };
    if ((leg.leg !== "outbound" && leg.leg !== "return") || typeof leg.date !== "string" || !Array.isArray(leg.flights)) continue;
    const flights = leg.flights.map(readFare).filter((fare): fare is RyanairFare => fare != null);
    if (flights.length > 0) legs.push({ leg: leg.leg, date: leg.date, flights });
  }
  return legs.length > 0 ? { trip: entry.trip, legs } : null;
}

function readLegWindow(value: unknown): LegWindow | null {
  if (!value || typeof value !== "object") return null;
  const leg = value as Partial<LegWindow>;
  if ((leg.leg !== "outbound" && leg.leg !== "return") || typeof leg.from !== "string" || typeof leg.to !== "string") {
    return null;
  }
  return { leg: leg.leg, from: leg.from, to: leg.to };
}

function readNoFareEntry(value: unknown): (NoFare & { trip: string }) | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as { trip?: unknown; missing?: unknown; available?: unknown };
  if (typeof entry.trip !== "string") return null;
  // Entries saved before both legs were checked held a single missing leg.
  const missing = Array.isArray(entry.missing)
    ? entry.missing.map(readLegWindow).filter((leg): leg is LegWindow => leg != null)
    : [readLegWindow(value)].filter((leg): leg is LegWindow => leg != null);
  if (missing.length === 0) return null;
  let available: NoFare["available"] = null;
  const found = entry.available as Record<string, unknown> | null | undefined;
  const window = readLegWindow(found);
  if (window && found && typeof found.amount === "number" && typeof found.date === "string") {
    available = {
      ...window,
      amount: found.amount,
      date: found.date,
      number: typeof found.number === "string" ? found.number : "",
      departs: typeof found.departs === "string" ? found.departs : null,
    };
  }
  return { trip: entry.trip, missing, available };
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

export function recordNoFare(route: WatchedRoute, noFare: NoFare | null) {
  const settings = readAutoRefresh();
  const next = { ...settings.noFare };
  if (noFare) next[route.id] = { missing: noFare.missing, available: noFare.available, trip: tripKey(route) };
  else if (route.id in next) delete next[route.id];
  else return;
  writeAutoRefresh({ ...settings, noFare: next });
}

export function canAutoRefresh(route: WatchedRoute, today: string): boolean {
  if (!lookupDestination(route.destinationIata)?.airlines.includes("ryanair")) return false;
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

import { isIsoDate } from "./format";
import type { WatchedRoute } from "./types";

/** Static fare snapshot produced by scripts/fetch-ryanair.ts. */
export const RYANAIR_FILE = "ryanair.json";

/** [date, price in PLN, departure time, arrival time]. */
export type RyanairDay = [date: string, amount: number, departs: string | null, arrives: string | null];

export type RyanairDestination = { iata: string; city: string; country: string };

export type RyanairFares = {
  out: RyanairDay[];
  back: RyanairDay[];
  /** Null means that this direction could not be read in the latest export. */
  outCheckedAt: string | null;
  /** Null means that this direction could not be read in the latest export. */
  backCheckedAt: string | null;
};

/**
 * Cheapest Ryanair fare for every published day from and to Kraków.
 *
 * The shape intentionally parallels wizz.json, while keeping only days with a
 * bookable PLN fare. The Ryanair monthly API does not give useful information
 * for unavailable days.
 */
export type RyanairData = {
  checkedAt: string;
  through: string;
  destinations: RyanairDestination[];
  fares: Record<string, RyanairFares>;
};

/** Reject malformed or stale-looking static files before code relies on them. */
export function parseRyanairData(raw: unknown): RyanairData | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<RyanairData>;
  if (typeof value.checkedAt !== "string" || !isIsoDate(value.through ?? "")) return null;
  if (!Array.isArray(value.destinations) || !value.fares || typeof value.fares !== "object") return null;

  const destinations = value.destinations.filter(
    (item): item is RyanairDestination =>
      !!item &&
      typeof item.iata === "string" &&
      /^[A-Z]{3}$/.test(item.iata) &&
      typeof item.city === "string" &&
      typeof item.country === "string",
  );
  const fares: RyanairData["fares"] = {};
  for (const [iata, entry] of Object.entries(value.fares)) {
    if (!/^[A-Z]{3}$/.test(iata) || !entry || typeof entry !== "object") continue;
    const legs = entry as { out?: unknown; back?: unknown; outCheckedAt?: unknown; backCheckedAt?: unknown };
    fares[iata] = {
      out: validDays(legs.out),
      back: validDays(legs.back),
      // Files published before per-leg timestamps remain readable. An explicit
      // null is meaningful: that direction did not answer in the last export.
      outCheckedAt: legs.outCheckedAt === undefined ? value.checkedAt : validTimestamp(legs.outCheckedAt) ? legs.outCheckedAt : null,
      backCheckedAt: legs.backCheckedAt === undefined ? value.checkedAt : validTimestamp(legs.backCheckedAt) ? legs.backCheckedAt : null,
    };
  }
  return { checkedAt: value.checkedAt, through: value.through as string, destinations, fares };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validDays(list: unknown): RyanairDay[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (day): day is RyanairDay =>
      Array.isArray(day) &&
      isIsoDate(day[0]) &&
      typeof day[1] === "number" &&
      Number.isFinite(day[1]) &&
      day[1] > 0 &&
      (day[2] === null || typeof day[2] === "string") &&
      (day[3] === null || typeof day[3] === "string"),
  );
}

export type RyanairLiveFare = {
  amount: number;
  outboundDate: string;
  outboundDepart: string | null;
  outboundArrive: string | null;
  returnDate: string | null;
  returnDepart: string | null;
  returnArrive: string | null;
  /** The older of the two leg reads; null when a required leg was not refreshed. */
  checkedAt: string | null;
};

/** One cheapest one-way flight for a Ryanair destination in the published window. */
export type RyanairCalendarDeal = {
  destination: RyanairDestination;
  date: string;
  amount: number;
  departs: string | null;
  arrives: string | null;
  checkedAt: string;
};

/**
 * Cheapest upcoming one-way Ryanair fare per destination, ranked across the
 * whole static calendar. This deliberately needs no watched route or history.
 */
export function ryanairCalendarDeals(data: RyanairData | null, today: string, limit = Number.POSITIVE_INFINITY): RyanairCalendarDeal[] {
  if (!data) return [];
  const byIata = new Map(data.destinations.map((destination) => [destination.iata, destination]));
  const deals: RyanairCalendarDeal[] = [];
  for (const [iata, fares] of Object.entries(data.fares)) {
    const destination = byIata.get(iata);
    if (!destination || !fares.outCheckedAt) continue;
    const cheapestOutbound = cheapest(fares.out, today, data.through);
    if (!cheapestOutbound) continue;
    deals.push({
      destination,
      date: cheapestOutbound[0],
      amount: cheapestOutbound[1],
      departs: cheapestOutbound[2],
      arrives: cheapestOutbound[3],
      checkedAt: fares.outCheckedAt,
    });
  }
  return deals.sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date) || a.destination.city.localeCompare(b.destination.city, "pl")).slice(0, limit);
}

/** Lowest confirmed Ryanair fare in the saved route window. */
export function liveRyanairFare(route: WatchedRoute, data: RyanairData | null, today: string): RyanairLiveFare | null {
  const fares = data?.fares[route.destinationIata];
  if (!data || !fares) return null;
  const outboundTo = route.returnDate ? minDate(route.outboundTo ?? route.outboundFrom, route.returnDate) : route.outboundTo ?? route.outboundFrom;
  const outboundFrom = route.outboundFrom < today ? today : route.outboundFrom;
  if (outboundFrom > outboundTo || outboundTo > data.through || (route.returnDate != null && route.returnDate > data.through)) return null;
  const outbound = cheapest(fares.out, outboundFrom, outboundTo);
  if (!outbound || fares.outCheckedAt == null) return null;

  const inbound = route.returnDate ? cheapest(fares.back, route.returnDate, route.returnDate) : null;
  if (route.returnDate && (!inbound || fares.backCheckedAt == null)) return null;
  return {
    amount: outbound[1] + (inbound?.[1] ?? 0),
    outboundDate: outbound[0],
    outboundDepart: outbound[2],
    outboundArrive: outbound[3],
    returnDate: inbound?.[0] ?? null,
    returnDepart: inbound?.[2] ?? null,
    returnArrive: inbound?.[3] ?? null,
    checkedAt: olderTimestamp(fares.outCheckedAt, route.returnDate ? fares.backCheckedAt : null),
  };
}

function cheapest(days: RyanairDay[], from: string, to: string): RyanairDay | null {
  return days
    .filter((day) => day[0] >= from && day[0] <= to)
    .reduce<RyanairDay | null>((best, day) => (!best || day[1] < best[1] ? day : best), null);
}

function olderTimestamp(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  return a < b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

let cached: RyanairData | null = null;
let loadState: "idle" | "loading" | "ready" | "error" = "idle";
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const notify of listeners) notify();
}

export function subscribeRyanair(listener: () => void) {
  listeners.add(listener);
  if (loadState === "idle" && typeof window !== "undefined") {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    loadState = "loading";
    void fetch(`${base}/${RYANAIR_FILE}`, { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        cached = parseRyanairData(payload);
        loadState = cached ? "ready" : "error";
      })
      .catch(() => {
        cached = null;
        loadState = "error";
      })
      .finally(() => {
        notifyListeners();
      });
  }
  return () => listeners.delete(listener);
}

export function getRyanairSnapshot(): RyanairData | null {
  return cached;
}

export function getRyanairServerSnapshot(): RyanairData | null {
  return null;
}

export function getRyanairLoadState(): "loading" | "ready" | "error" {
  return loadState === "error" ? "error" : cached ? "ready" : "loading";
}

import { isIsoDate, roundMoney } from "./format";
import type { PriceLog, WatchedRoute } from "./types";

/**
 * Wizz Air answers only pages on wizzair.com, so a scheduled GitHub job reads its
 * timetable and publishes it next to the site as wizz.json.
 */
export const WIZZ_FILE = "wizz.json";

/** [date, cheapest fare or null when Wizz shows "check price", departure times]. */
export type WizzDay = [date: string, amount: number | null, departs: string[]];

export type WizzDestination = { iata: string; city: string; country: string; startsOn: string | null };

export type WizzData = {
  checkedAt: string;
  apiVersion: string;
  through: string;
  destinations: WizzDestination[];
  fares: Record<string, { out: WizzDay[]; back: WizzDay[] }>;
};

/** Days from one timetable answer. Null when the payload is not a timetable. */
export function parseWizzTimetable(payload: unknown): { out: WizzDay[]; back: WizzDay[] } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { outboundFlights?: unknown; returnFlights?: unknown };
  if (value.outboundFlights != null && !Array.isArray(value.outboundFlights)) return null;
  if (value.returnFlights != null && !Array.isArray(value.returnFlights)) return null;
  return { out: readDays(value.outboundFlights), back: readDays(value.returnFlights) };
}

function readDays(list: unknown): WizzDay[] {
  if (!Array.isArray(list)) return [];
  const days: WizzDay[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const flight = item as {
      departureDate?: unknown;
      price?: { amount?: unknown; currencyCode?: unknown } | null;
      priceType?: unknown;
      departureDates?: unknown;
    };
    if (typeof flight.departureDate !== "string") continue;
    const date = flight.departureDate.slice(0, 10);
    if (!isIsoDate(date)) continue;
    const amount = flight.price?.amount;
    const priced =
      flight.priceType === "price" &&
      flight.price?.currencyCode === "PLN" &&
      typeof amount === "number" &&
      Number.isFinite(amount) &&
      amount > 0;
    const departs = Array.isArray(flight.departureDates)
      ? flight.departureDates
          .map((time) => (typeof time === "string" ? /T(\d{2}:\d{2})/.exec(time)?.[1] : undefined))
          .filter((time): time is string => time != null)
          .sort()
      : [];
    days.push([date, priced ? roundMoney(amount as number) : null, departs]);
  }
  return days.sort((a, b) => a[0].localeCompare(b[0]));
}

export function parseWizzData(raw: unknown): WizzData | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<WizzData>;
  if (typeof value.checkedAt !== "string" || typeof value.through !== "string") return null;
  if (!Array.isArray(value.destinations) || !value.fares || typeof value.fares !== "object") return null;
  const destinations = value.destinations.filter(
    (item): item is WizzDestination =>
      !!item &&
      typeof item.iata === "string" &&
      /^[A-Z]{3}$/.test(item.iata) &&
      typeof item.city === "string" &&
      typeof item.country === "string",
  );
  const fares: WizzData["fares"] = {};
  for (const [iata, entry] of Object.entries(value.fares)) {
    if (!/^[A-Z]{3}$/.test(iata) || !entry || typeof entry !== "object") continue;
    fares[iata] = { out: validDays(entry.out), back: validDays(entry.back) };
  }
  return {
    checkedAt: value.checkedAt,
    apiVersion: typeof value.apiVersion === "string" ? value.apiVersion : "",
    through: value.through,
    destinations,
    fares,
  };
}

function validDays(list: unknown): WizzDay[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (day): day is WizzDay =>
      Array.isArray(day) &&
      isIsoDate(day[0]) &&
      (day[1] === null || (typeof day[1] === "number" && day[1] > 0)) &&
      Array.isArray(day[2]),
  );
}

export type WizzLegWindow = { leg: "outbound" | "return"; from: string; to: string };

export type WizzOutcome =
  | { status: "saved"; log: PriceLog }
  | { status: "unchanged"; amount: number }
  | { status: "not-served" | "past" | "no-data" }
  /** No Wizz flight in the window, or every flight there shows "check price" at Wizz. */
  | { status: "no-fare"; missing: (WizzLegWindow & { soldOut: boolean })[] };

/**
 * Cheapest Wizz fare in the saved window from the published timetable.
 * A return trip adds the return day's fare, like the Ryanair price.
 */
export function quoteWizz(
  route: WatchedRoute,
  logs: PriceLog[],
  data: WizzData | null,
  today: string,
  now: () => Date = () => new Date(),
): WizzOutcome {
  const fares = data?.fares[route.destinationIata];
  if (!data || !fares) return { status: data ? "not-served" : "no-data" };

  const windowEnd = route.returnDate
    ? minDate(route.outboundTo ?? route.outboundFrom, route.returnDate)
    : route.outboundTo ?? route.outboundFrom;
  const windowStart = route.outboundFrom < today ? today : route.outboundFrom;
  if (windowEnd < windowStart || (route.returnDate != null && route.returnDate < today)) return { status: "past" };
  if (windowStart > data.through || (route.returnDate != null && route.returnDate > data.through)) {
    return { status: "no-data" };
  }

  const outboundWindow: WizzLegWindow = { leg: "outbound", from: windowStart, to: windowEnd };
  const returnWindow: WizzLegWindow | null = route.returnDate
    ? { leg: "return", from: route.returnDate, to: route.returnDate }
    : null;
  const outbound = cheapestDay(fares.out, outboundWindow);
  const inbound = returnWindow ? cheapestDay(fares.back, returnWindow) : null;

  const missing: (WizzLegWindow & { soldOut: boolean })[] = [];
  if (!outbound.day) missing.push({ ...outboundWindow, soldOut: outbound.soldOut });
  if (returnWindow && inbound && !inbound.day) missing.push({ ...returnWindow, soldOut: inbound.soldOut });
  if (missing.length > 0 || !outbound.day) return { status: "no-fare", missing };

  const legs = [outbound.day, inbound?.day ?? null].filter((day): day is WizzDay => day != null);
  const amount = roundMoney(legs.reduce((sum, day) => sum + (day[1] ?? 0), 0));
  const autoFlights = legs.map((day) => `W6 ${day[0]}${legs.length > 1 ? ` ${day[1]}` : ""}`).join("; ");

  const previous = [...logs]
    .filter((log) => log.routeId === route.id && log.airline === "wizzair")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (previous && previous.checkedOn === today && previous.amount === amount && previous.autoFlights === autoFlights) {
    return { status: "unchanged", amount };
  }

  return {
    status: "saved",
    log: {
      id: crypto.randomUUID(),
      routeId: route.id,
      airline: "wizzair",
      amount,
      currency: "PLN",
      checkedOn: today,
      outboundDepart: outbound.day[2][0] ?? null,
      outboundArrive: null,
      returnDepart: inbound?.day?.[2][0] ?? null,
      returnArrive: null,
      createdAt: now().toISOString(),
      autoFlights,
    },
  };
}

function cheapestDay(days: WizzDay[], window: WizzLegWindow): { day: WizzDay | null; soldOut: boolean } {
  const inside = days.filter((day) => day[0] >= window.from && day[0] <= window.to);
  const priced = inside.filter((day) => day[1] != null);
  if (priced.length === 0) return { day: null, soldOut: inside.length > 0 };
  return { day: priced.reduce((best, day) => ((day[1] as number) < (best[1] as number) ? day : best)), soldOut: false };
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

let cached: WizzData | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function subscribeWizz(listener: () => void) {
  listeners.add(listener);
  if (!cached && !loading && typeof window !== "undefined") {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    loading = fetch(`${base}/${WIZZ_FILE}`, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        cached = parseWizzData(payload);
        for (const notify of listeners) notify();
      })
      .catch(() => undefined);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getWizzSnapshot(): WizzData | null {
  return cached;
}

export function getWizzServerSnapshot(): WizzData | null {
  return null;
}

export function readWizz(): WizzData | null {
  return cached;
}

import { lookupDestination } from "./network-refresh";
import { formatDate, isIsoDate, roundMoney } from "./format";
import { readJson, ryanairFaresUrl, type FlightFetch, type FlightReadFailure } from "./flight-day";
import { orderedLogs } from "./routes";
import type { PriceLog, WatchedRoute } from "./types";

export type RyanairFare = {
  amount: number;
  date: string;
  number: string;
  departs: string | null;
  arrives: string | null;
};

export type NoFareLeg = { leg: "outbound" | "return"; from: string; to: string };

export type RefreshOutcome =
  | { status: "saved"; log: PriceLog }
  | { status: "unchanged"; amount: number }
  | { status: "not-served" | "past" }
  | ({ status: "no-fare" } & NoFareLeg)
  | { status: "failed"; reason: FlightReadFailure };

/** Cheapest Ryanair fare departing between from and to, or "none" when nothing is on sale. */
export function parseRyanairCheapest(payload: unknown, from: string, to: string): RyanairFare | "none" | null {
  if (!payload || typeof payload !== "object") return null;
  const fares = (payload as { fares?: unknown }).fares;
  if (!Array.isArray(fares)) return null;

  let cheapest: RyanairFare | null = null;
  for (const fare of fares) {
    if (!fare || typeof fare !== "object") continue;
    const outbound = (fare as { outbound?: unknown }).outbound;
    if (!outbound || typeof outbound !== "object") continue;
    const record = outbound as {
      departureDate?: unknown;
      arrivalDate?: unknown;
      flightNumber?: unknown;
      price?: { value?: unknown; currencyCode?: unknown } | null;
    };
    if (typeof record.departureDate !== "string") continue;
    const date = record.departureDate.slice(0, 10);
    if (!isIsoDate(date) || date < from || date > to) continue;
    const value = record.price?.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    if (record.price?.currencyCode !== "PLN") continue;
    const candidate: RyanairFare = {
      amount: roundMoney(value),
      date,
      number: typeof record.flightNumber === "string" ? record.flightNumber.trim() : "",
      departs: clock(record.departureDate),
      arrives: typeof record.arrivalDate === "string" ? clock(record.arrivalDate) : null,
    };
    if (!cheapest || candidate.amount < cheapest.amount) cheapest = candidate;
  }
  return cheapest ?? "none";
}

/**
 * Asks Ryanair for the cheapest fare on the saved day, or across the saved range.
 * A return trip is priced as two one-way tickets added together.
 */
export async function refreshRyanairPrice(
  route: WatchedRoute,
  logs: PriceLog[],
  today: string,
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
  now: () => Date = () => new Date(),
): Promise<RefreshOutcome> {
  if (!lookupDestination(route.destinationIata)?.airlines.includes("ryanair")) return { status: "not-served" };

  const windowEnd = route.returnDate
    ? minDate(route.outboundTo ?? route.outboundFrom, route.returnDate)
    : route.outboundTo ?? route.outboundFrom;
  const windowStart = route.outboundFrom < today ? today : route.outboundFrom;
  if (windowEnd < windowStart || (route.returnDate != null && route.returnDate < today)) return { status: "past" };

  const outbound = await cheapestLeg("KRK", route.destinationIata, windowStart, windowEnd, fetchImpl, signal);
  if (outbound.status !== "ok") {
    return outbound.status === "none"
      ? { status: "no-fare", leg: "outbound", from: windowStart, to: windowEnd }
      : { status: "failed", reason: outbound.reason };
  }

  let inbound: RyanairFare | null = null;
  if (route.returnDate) {
    const leg = await cheapestLeg(route.destinationIata, "KRK", route.returnDate, route.returnDate, fetchImpl, signal);
    if (leg.status !== "ok") {
      return leg.status === "none"
        ? { status: "no-fare", leg: "return", from: route.returnDate, to: route.returnDate }
        : { status: "failed", reason: leg.reason };
    }
    inbound = leg.fare;
  }

  const amount = roundMoney(outbound.fare.amount + (inbound?.amount ?? 0));
  const autoFlights = [outbound.fare, inbound]
    .filter((fare): fare is RyanairFare => fare != null)
    .map((fare) => `${fare.number || "FR"} ${fare.date}`)
    .join("; ");

  const previous = orderedLogs(logs, route.id).find((log) => log.airline === "ryanair");
  if (previous && previous.checkedOn === today && previous.amount === amount && previous.autoFlights === autoFlights) {
    return { status: "unchanged", amount };
  }

  return {
    status: "saved",
    log: {
      id: crypto.randomUUID(),
      routeId: route.id,
      airline: "ryanair",
      amount,
      currency: "PLN",
      checkedOn: today,
      outboundDepart: outbound.fare.departs,
      outboundArrive: outbound.fare.arrives,
      returnDepart: inbound?.departs ?? null,
      returnArrive: inbound?.arrives ?? null,
      createdAt: now().toISOString(),
      autoFlights,
    },
  };
}

/** "Ryanair nie sprzedaje wylotu z KRK 5 lis 2026." for the leg without a fare. */
export function noFareText(iata: string, noFare: NoFareLeg): string {
  const dates = noFare.from === noFare.to ? formatDate(noFare.from) : `${formatDate(noFare.from)} – ${formatDate(noFare.to)}`;
  return noFare.leg === "outbound"
    ? `Ryanair nie sprzedaje lotu KRK → ${iata} ${dates}.`
    : `Ryanair nie sprzedaje powrotu ${iata} → KRK ${dates}.`;
}

/** "FR3799, 23 lis 2026" for one leg, legs joined with " + ". */
export function formatAutoFlights(autoFlights: string | null | undefined): string | null {
  if (!autoFlights) return null;
  const legs = autoFlights
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .map(([number, date]) => (date && isIsoDate(date) ? `${number}, ${formatDate(date)}` : number))
    .filter(Boolean);
  return legs.length > 0 ? legs.join(" + ") : null;
}

async function cheapestLeg(
  origin: string,
  destination: string,
  from: string,
  to: string,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<{ status: "ok"; fare: RyanairFare } | { status: "none" } | { status: "failed"; reason: FlightReadFailure }> {
  const url = ryanairFaresUrl(origin, destination, from, to);
  if (!url) return { status: "failed", reason: "unreadable" };
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return { status: "failed", reason: read.reason };
  const fare = parseRyanairCheapest(read.payload, from, to);
  if (fare == null) return { status: "failed", reason: "unreadable" };
  if (fare === "none") return { status: "none" };
  return { status: "ok", fare };
}

function clock(value: string): string | null {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? null;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

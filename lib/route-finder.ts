import { lookupDestination } from "./network-refresh";
import { isIsoDate, roundMoney } from "./format";
import { readJson, type FlightFetch, type FlightReadFailure } from "./flight-day";
import type { Destination, PriceLog, SearchTrip } from "./types";

export type FoundLeg = {
  date: string;
  number: string;
  departs: string | null;
  arrives: string | null;
  amount: number;
};

export type FoundRoute = {
  destination: Destination;
  amount: number;
  outbound: FoundLeg;
  inbound: FoundLeg | null;
};

export type FinderResult =
  | { ok: true; routes: FoundRoute[]; unlisted: number }
  | { ok: false; reason: FlightReadFailure };

/** One Ryanair request lists every destination from KRK with its cheapest fare in the window. */
export function ryanairFinderUrl(trip: SearchTrip): string | null {
  const to = trip.outboundTo ?? trip.outboundFrom;
  if (!isIsoDate(trip.outboundFrom) || !isIsoDate(to) || to < trip.outboundFrom) return null;
  const params = new URLSearchParams({
    departureAirportIataCode: "KRK",
    outboundDepartureDateFrom: trip.outboundFrom,
    outboundDepartureDateTo: to,
  });
  if (trip.returnDate) {
    if (!isIsoDate(trip.returnDate) || trip.returnDate < trip.outboundFrom) return null;
    params.set("inboundDepartureDateFrom", trip.returnDate);
    params.set("inboundDepartureDateTo", trip.returnDate);
  }
  params.set("currency", "PLN");
  const kind = trip.returnDate ? "roundTripFares" : "oneWayFares";
  return `https://www.ryanair.com/api/farfnd/v4/${kind}?${params.toString()}`;
}

/** Keeps destinations in the KRK winter guide; the rest are only counted. */
export function parseFinder(payload: unknown, trip: SearchTrip): { routes: FoundRoute[]; unlisted: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const fares = (payload as { fares?: unknown }).fares;
  if (!Array.isArray(fares)) return null;

  const outboundTo = trip.outboundTo ?? trip.outboundFrom;
  const best = new Map<string, FoundRoute>();
  let unlisted = 0;
  for (const fare of fares) {
    if (!fare || typeof fare !== "object") continue;
    const record = fare as { outbound?: unknown; inbound?: unknown };
    const outbound = readLeg(record.outbound);
    if (!outbound || outbound.origin !== "KRK") continue;
    if (outbound.leg.date < trip.outboundFrom || outbound.leg.date > outboundTo) continue;
    let inbound: FoundLeg | null = null;
    if (trip.returnDate) {
      const back = readLeg(record.inbound);
      if (!back || back.arrival !== "KRK" || back.origin !== outbound.arrival || back.leg.date !== trip.returnDate) continue;
      inbound = back.leg;
    }
    const destination = lookupDestination(outbound.arrival);
    if (!destination || !destination.airlines.includes("ryanair")) {
      unlisted += 1;
      continue;
    }
    const amount = roundMoney(outbound.leg.amount + (inbound?.amount ?? 0));
    const current = best.get(destination.iata);
    if (!current || amount < current.amount) best.set(destination.iata, { destination, amount, outbound: outbound.leg, inbound });
  }
  return { routes: [...best.values()].sort((a, b) => a.amount - b.amount), unlisted };
}

export async function findRyanairRoutes(
  trip: SearchTrip,
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
): Promise<FinderResult> {
  const url = ryanairFinderUrl(trip);
  if (!url) return { ok: false, reason: "unreadable" };
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return read;
  const parsed = parseFinder(read.payload, trip);
  return parsed ? { ok: true, ...parsed } : { ok: false, reason: "unreadable" };
}

/** Wizz Air blocks browser reads, so its destinations are listed for adding without a price. */
export function wizzOnlyDestinations(destinations: Destination[]): Destination[] {
  return destinations
    .filter((destination) => destination.airlines.length === 1 && destination.airlines[0] === "wizzair")
    .sort((a, b) => a.city.localeCompare(b.city, "pl"));
}

export function foundRouteLog(found: FoundRoute, routeId: string, today: string, now: Date = new Date()): PriceLog {
  const legs = found.inbound ? [found.outbound, found.inbound] : [found.outbound];
  return {
    id: crypto.randomUUID(),
    routeId,
    airline: "ryanair",
    amount: found.amount,
    currency: "PLN",
    checkedOn: today,
    outboundDepart: found.outbound.departs,
    outboundArrive: found.outbound.arrives,
    returnDepart: found.inbound?.departs ?? null,
    returnArrive: found.inbound?.arrives ?? null,
    createdAt: now.toISOString(),
    autoFlights: legs.map((leg) => `${leg.number || "FR"} ${leg.date}`).join("; "),
  };
}

function readLeg(value: unknown): { origin: string; arrival: string; leg: FoundLeg } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    departureAirport?: { iataCode?: unknown } | null;
    arrivalAirport?: { iataCode?: unknown } | null;
    departureDate?: unknown;
    arrivalDate?: unknown;
    flightNumber?: unknown;
    price?: { value?: unknown; currencyCode?: unknown } | null;
  };
  const origin = record.departureAirport?.iataCode;
  const arrival = record.arrivalAirport?.iataCode;
  if (typeof origin !== "string" || typeof arrival !== "string") return null;
  if (typeof record.departureDate !== "string") return null;
  const date = record.departureDate.slice(0, 10);
  if (!isIsoDate(date)) return null;
  const amount = record.price?.value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || record.price?.currencyCode !== "PLN") {
    return null;
  }
  return {
    origin,
    arrival,
    leg: {
      date,
      number: typeof record.flightNumber === "string" ? record.flightNumber.trim() : "",
      departs: clock(record.departureDate),
      arrives: typeof record.arrivalDate === "string" ? clock(record.arrivalDate) : null,
      amount: roundMoney(amount),
    },
  };
}

function clock(value: string): string | null {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? null;
}

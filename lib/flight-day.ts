import { isIsoDate } from "./format";
import type { Airline } from "./types";

/** Days checked in one click when the route stores a date range. */
export const MAX_FLIGHT_DAY_SPAN = 14;

/**
 * Wizz publishes bookable days at a versioned address. 29.22.0 is the apiUrl
 * from wizzair.com on 27 October 2026. Their response is readable only from
 * their own site, so a browser on this app can reject it.
 */
const WIZZ_API_VERSION = "29.22.0";

export type FlightDirection = "outbound" | "return";

export type ScheduledFlight = {
  number: string;
  departs: string;
};

export type FlightDayStatus = "operated" | "absent" | "unavailable";

export type FlightDay = {
  date: string;
  status: FlightDayStatus;
  flights: ScheduledFlight[];
};

export type FlightReadFailure = "blocked" | "http" | "unreadable";

export type FlightLegReport = {
  airline: Airline;
  direction: FlightDirection;
  origin: string;
  destination: string;
  truncated: boolean;
  failure: FlightReadFailure | null;
  days: FlightDay[];
};

export type FlightDayTrip = {
  destinationIata: string;
  outboundFrom: string;
  outboundTo: string | null;
  returnDate: string | null;
};

export type FlightFetch = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type ReadResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: FlightReadFailure };

type LegQuery = {
  direction: FlightDirection;
  origin: string;
  destination: string;
  dates: string[];
  truncated: boolean;
};

export function datesToCheck(from: string, to: string | null): { dates: string[]; truncated: boolean } {
  if (!isIsoDate(from)) return { dates: [], truncated: false };
  if (!to || to === from || !isIsoDate(to) || to < from) return { dates: [from], truncated: false };

  const dates: string[] = [];
  let cursor = from;
  let truncated = false;
  while (cursor <= to) {
    if (dates.length === MAX_FLIGHT_DAY_SPAN) {
      truncated = true;
      break;
    }
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return { dates, truncated };
}

export function ryanairDayUrl(origin: string, destination: string, date: string): string | null {
  return ryanairFaresUrl(origin, destination, date, date);
}

export function ryanairFaresUrl(origin: string, destination: string, fromDate: string, toDate: string): string | null {
  const from = airportCode(origin);
  const to = airportCode(destination);
  if (!from || !to || !isIsoDate(fromDate) || !isIsoDate(toDate) || toDate < fromDate) return null;
  const params = new URLSearchParams({
    departureAirportIataCode: from,
    arrivalAirportIataCode: to,
    outboundDepartureDateFrom: fromDate,
    outboundDepartureDateTo: toDate,
    currency: "PLN",
  });
  return `https://www.ryanair.com/api/farfnd/v4/oneWayFares?${params.toString()}`;
}

export function wizzDatesUrl(origin: string, destination: string, from: string, to: string): string | null {
  const departure = airportCode(origin);
  const arrival = airportCode(destination);
  if (!departure || !arrival || !isIsoDate(from) || !isIsoDate(to)) return null;
  const params = new URLSearchParams({
    departureStation: departure,
    arrivalStation: arrival,
    from,
    to,
  });
  return `https://be.wizzair.com/${WIZZ_API_VERSION}/Api/search/flightDates?${params.toString()}`;
}

/** A day counts only when the returned departure falls on that calendar date. The fare amount is ignored. */
export function parseRyanairDay(
  payload: unknown,
  date: string,
): { status: "operated" | "absent"; flights: ScheduledFlight[] } | null {
  if (!payload || typeof payload !== "object") return null;
  const fares = (payload as { fares?: unknown }).fares;
  if (!Array.isArray(fares)) return null;

  const flights: ScheduledFlight[] = [];
  for (const fare of fares) {
    if (!fare || typeof fare !== "object") continue;
    const outbound = (fare as { outbound?: unknown }).outbound;
    if (!outbound || typeof outbound !== "object") continue;
    const record = outbound as { departureDate?: unknown; flightNumber?: unknown };
    if (typeof record.departureDate !== "string" || !record.departureDate.startsWith(`${date}T`)) continue;
    const departs = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(record.departureDate)?.[2] ?? "";
    const number = typeof record.flightNumber === "string" ? record.flightNumber.trim() : "";
    flights.push({ number, departs });
  }

  if (flights.length === 0) return { status: "absent", flights: [] };
  return { status: "operated", flights };
}

/** Bookable Wizz days as YYYY-MM-DD, or null when the payload is not their flightDates list. */
export function parseWizzDates(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object") return null;
  const dates = (payload as { flightDates?: unknown }).flightDates;
  if (!Array.isArray(dates)) return null;

  const days: string[] = [];
  for (const value of dates) {
    if (typeof value !== "string") return null;
    const day = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
    if (!day) return null;
    days.push(day);
  }
  return days;
}

export async function checkRouteFlights(
  trip: FlightDayTrip,
  airlines: Airline[],
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
): Promise<FlightLegReport[]> {
  const destination = airportCode(trip.destinationIata);
  if (!destination || airlines.length === 0) return [];

  const outbound = datesToCheck(trip.outboundFrom, trip.outboundTo);
  if (outbound.dates.length === 0) return [];

  const legs: LegQuery[] = [
    {
      direction: "outbound",
      origin: "KRK",
      destination,
      dates: outbound.dates,
      truncated: outbound.truncated,
    },
  ];
  if (trip.returnDate && isIsoDate(trip.returnDate) && trip.returnDate >= trip.outboundFrom) {
    legs.push({
      direction: "return",
      origin: destination,
      destination: "KRK",
      dates: [trip.returnDate],
      truncated: false,
    });
  }

  return Promise.all(airlines.flatMap((airline) => legs.map((leg) => checkLeg(airline, leg, fetchImpl, signal))));
}

async function checkLeg(
  airline: Airline,
  leg: LegQuery,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<FlightLegReport> {
  const base = {
    airline,
    direction: leg.direction,
    origin: leg.origin,
    destination: leg.destination,
    truncated: leg.truncated,
  };

  if (airline === "wizzair") {
    const url = wizzDatesUrl(leg.origin, leg.destination, leg.dates[0], leg.dates[leg.dates.length - 1]);
    const read = url ? await readJson(url, fetchImpl, signal) : { ok: false as const, reason: "unreadable" as const };
    if (!read.ok) return { ...base, failure: read.reason, days: unavailableDays(leg.dates) };
    const open = parseWizzDates(read.payload);
    if (!open) return { ...base, failure: "unreadable", days: unavailableDays(leg.dates) };
    const openDays = new Set(open);
    return {
      ...base,
      failure: null,
      days: leg.dates.map((date) => ({
        date,
        status: openDays.has(date) ? "operated" : "absent",
        flights: [],
      })),
    };
  }

  const days = await Promise.all(
    leg.dates.map(async (date) => {
      const url = ryanairDayUrl(leg.origin, leg.destination, date);
      const read = url ? await readJson(url, fetchImpl, signal) : { ok: false as const, reason: "unreadable" as const };
      if (!read.ok) return { date, status: "unavailable" as const, flights: [], reason: read.reason };
      const parsed = parseRyanairDay(read.payload, date);
      if (!parsed) return { date, status: "unavailable" as const, flights: [], reason: "unreadable" as const };
      return { date, status: parsed.status, flights: parsed.flights, reason: null };
    }),
  );

  const failed = days.every((day) => day.status === "unavailable");
  return {
    ...base,
    failure: failed ? days[0]?.reason ?? "unreadable" : null,
    days: days.map(({ date, status, flights }) => ({ date, status, flights })),
  };
}

function unavailableDays(dates: string[]): FlightDay[] {
  return dates.map((date) => ({ date, status: "unavailable", flights: [] }));
}

export async function readJson(url: string, fetchImpl: FlightFetch, signal?: AbortSignal): Promise<ReadResult> {
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return { ok: false, reason: "http" };
    try {
      return { ok: true, payload: await response.json() };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ok: false, reason: "unreadable" };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, reason: "blocked" };
  }
}

function airportCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

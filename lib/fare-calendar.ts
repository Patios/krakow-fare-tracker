import { isIsoDate, roundMoney } from "./format";
import { parseRyanairCheapest } from "./fare-refresh";
import { readJson, ryanairFaresUrl, type FlightFetch, type FlightReadFailure } from "./flight-day";
import type { PriceLog, WatchedRoute } from "./types";

export type CalendarDay = {
  date: string;
  status: "fare" | "sold-out" | "none";
  amount: number | null;
  departs: string | null;
  arrives: string | null;
};

export type PickedLeg = {
  date: string;
  amount: number;
  departs: string | null;
  arrives: string | null;
  number: string;
};

export type MonthRead = { ok: true; days: CalendarDay[] } | { ok: false; reason: FlightReadFailure };

/** "2026-12-01" for any day in December 2026. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

/** Days of the month in a Monday-first grid, padded with null before the 1st. */
export function monthGrid(month: string): (string | null)[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const length = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= length; day += 1) {
    days.push(`${month.slice(0, 8)}${String(day).padStart(2, "0")}`);
  }
  return days;
}

export function ryanairMonthUrl(origin: string, destination: string, month: string): string | null {
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !isIsoDate(month)) return null;
  const params = new URLSearchParams({ outboundMonthOfDate: monthStart(month), currency: "PLN" });
  return `https://www.ryanair.com/api/farfnd/v4/oneWayFares/${origin}/${destination}/cheapestPerDay?${params.toString()}`;
}

export function parseRyanairMonth(payload: unknown, month: string): CalendarDay[] | null {
  if (!payload || typeof payload !== "object") return null;
  const fares = (payload as { outbound?: { fares?: unknown } }).outbound?.fares;
  if (!Array.isArray(fares)) return null;
  const prefix = month.slice(0, 7);
  const days: CalendarDay[] = [];
  for (const fare of fares) {
    if (!fare || typeof fare !== "object") continue;
    const record = fare as {
      day?: unknown;
      departureDate?: unknown;
      arrivalDate?: unknown;
      price?: { value?: unknown; currencyCode?: unknown } | null;
      soldOut?: unknown;
    };
    if (typeof record.day !== "string" || !isIsoDate(record.day) || !record.day.startsWith(prefix)) continue;
    const value = record.price?.value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && record.price?.currencyCode === "PLN") {
      days.push({
        date: record.day,
        status: "fare",
        amount: roundMoney(value),
        departs: typeof record.departureDate === "string" ? clock(record.departureDate) : null,
        arrives: typeof record.arrivalDate === "string" ? clock(record.arrivalDate) : null,
      });
    } else {
      days.push({
        date: record.day,
        status: record.soldOut === true ? "sold-out" : "none",
        amount: null,
        departs: null,
        arrives: null,
      });
    }
  }
  return days;
}

export async function loadRyanairMonth(
  origin: string,
  destination: string,
  month: string,
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
): Promise<MonthRead> {
  const url = ryanairMonthUrl(origin, destination, month);
  if (!url) return { ok: false, reason: "unreadable" };
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return read;
  const days = parseRyanairMonth(read.payload, month);
  return days ? { ok: true, days } : { ok: false, reason: "unreadable" };
}

/** The month view has no flight numbers, so the chosen day is read once more for its number and current fare. */
export async function confirmLeg(
  origin: string,
  destination: string,
  day: CalendarDay,
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
): Promise<PickedLeg | null> {
  if (day.status !== "fare" || day.amount == null) return null;
  const fallback: PickedLeg = { date: day.date, amount: day.amount, departs: day.departs, arrives: day.arrives, number: "" };
  const url = ryanairFaresUrl(origin, destination, day.date, day.date);
  if (!url) return fallback;
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return fallback;
  const fare = parseRyanairCheapest(read.payload, day.date, day.date);
  if (!fare || fare === "none") return fallback;
  return { date: fare.date, amount: fare.amount, departs: fare.departs, arrives: fare.arrives, number: fare.number };
}

/** The route moves to the chosen flights, and their total is logged as a Ryanair price. */
export function applyPickedFlights(
  route: WatchedRoute,
  outbound: PickedLeg,
  inbound: PickedLeg | null,
  today: string,
  now: Date = new Date(),
): { route: WatchedRoute; log: PriceLog } {
  const nextRoute: WatchedRoute = {
    ...route,
    outboundFrom: outbound.date,
    outboundTo: null,
    returnDate: inbound?.date ?? null,
    outboundDepart: outbound.departs,
    outboundArrive: outbound.arrives,
    returnDepart: inbound?.departs ?? null,
    returnArrive: inbound?.arrives ?? null,
  };
  const legs = inbound ? [outbound, inbound] : [outbound];
  return {
    route: nextRoute,
    log: {
      id: crypto.randomUUID(),
      routeId: route.id,
      airline: "ryanair",
      amount: roundMoney(legs.reduce((sum, leg) => sum + leg.amount, 0)),
      currency: "PLN",
      checkedOn: today,
      outboundDepart: outbound.departs,
      outboundArrive: outbound.arrives,
      returnDepart: inbound?.departs ?? null,
      returnArrive: inbound?.arrives ?? null,
      createdAt: now.toISOString(),
      autoFlights: legs.map((leg) => `${leg.number || "FR"} ${leg.date}`).join("; "),
    },
  };
}

/** Lowest fare among the days that can still be picked. */
export function cheapestDay(days: CalendarDay[], earliest: string): CalendarDay | null {
  let best: CalendarDay | null = null;
  for (const day of days) {
    if (day.status !== "fare" || day.amount == null || day.date < earliest) continue;
    if (!best || day.amount < (best.amount ?? Infinity)) best = day;
  }
  return best;
}

function clock(value: string): string | null {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? null;
}

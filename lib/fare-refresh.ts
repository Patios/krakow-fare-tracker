import { lookupDestination } from "./network-refresh";
import { formatDate, formatPln, isIsoDate, roundMoney } from "./format";
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

export type LegWindow = { leg: "outbound" | "return"; from: string; to: string };

/** Every Ryanair flight on one day, cheapest first. Only single-day legs list them. */
export type DayFlights = { leg: LegWindow["leg"]; date: string; flights: RyanairFare[] };

/** Which legs Ryanair has no fare for, and the price of the other leg when it is on sale. */
export type NoFare = {
  missing: LegWindow[];
  available: (LegWindow & { amount: number; date: string; number: string; departs: string | null }) | null;
};

export type RefreshOutcome =
  | { status: "saved"; log: PriceLog; dayFlights: DayFlights[] }
  | { status: "unchanged"; amount: number; dayFlights: DayFlights[] }
  | { status: "not-served" | "past" }
  | ({ status: "no-fare"; dayFlights: DayFlights[] } & NoFare)
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

  const outboundWindow: LegWindow = { leg: "outbound", from: windowStart, to: windowEnd };
  const returnWindow: LegWindow | null = route.returnDate
    ? { leg: "return", from: route.returnDate, to: route.returnDate }
    : null;
  const [outbound, inboundLeg] = await Promise.all([
    cheapestLeg("KRK", route.destinationIata, outboundWindow.from, outboundWindow.to, fetchImpl, signal),
    returnWindow
      ? cheapestLeg(route.destinationIata, "KRK", returnWindow.from, returnWindow.to, fetchImpl, signal)
      : Promise.resolve(null),
  ]);
  if (outbound.status === "failed") return { status: "failed", reason: outbound.reason };
  if (inboundLeg?.status === "failed") return { status: "failed", reason: inboundLeg.reason };

  const dayFlights: DayFlights[] = [];
  if (outbound.status === "ok" && outbound.day) dayFlights.push({ leg: "outbound", date: outboundWindow.from, flights: outbound.day });
  if (inboundLeg?.status === "ok" && inboundLeg.day && returnWindow) {
    dayFlights.push({ leg: "return", date: returnWindow.from, flights: inboundLeg.day });
  }

  if (outbound.status === "none" || inboundLeg?.status === "none") {
    const missing = [outbound.status === "none" ? outboundWindow : null, inboundLeg?.status === "none" ? returnWindow : null]
      .filter((leg): leg is LegWindow => leg != null);
    const found =
      outbound.status === "ok"
        ? { window: outboundWindow, fare: outbound.fare }
        : inboundLeg?.status === "ok" && returnWindow
          ? { window: returnWindow, fare: inboundLeg.fare }
          : null;
    return {
      status: "no-fare",
      dayFlights,
      missing,
      available: found
        ? {
            ...found.window,
            amount: found.fare.amount,
            date: found.fare.date,
            number: found.fare.number,
            departs: found.fare.departs,
          }
        : null,
    };
  }

  const inbound = inboundLeg?.status === "ok" ? inboundLeg.fare : null;
  const amount = roundMoney(outbound.fare.amount + (inbound?.amount ?? 0));
  const autoFlights = [outbound.fare, inbound]
    .filter((fare): fare is RyanairFare => fare != null)
    .map((fare) => `${fare.number || "FR"} ${fare.date}${inbound ? ` ${fare.amount}` : ""}`)
    .join("; ");

  const previous = orderedLogs(logs, route.id).find((log) => log.airline === "ryanair");
  if (
    previous &&
    previous.checkedOn === today &&
    previous.amount === amount &&
    flightKeys(previous.autoFlights) === flightKeys(autoFlights)
  ) {
    return { status: "unchanged", amount, dayFlights };
  }

  return {
    status: "saved",
    dayFlights,
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

/**
 * "Ryanair nie sprzedaje lotu KRK → MXP 5 lis 2026. Powrót MXP → KRK 6 lis 2026: 194,76 zł (FR4463, 21:15)."
 */
export function noFareText(iata: string, noFare: NoFare): string {
  const legName = (leg: LegWindow["leg"]) => (leg === "outbound" ? `lotu KRK → ${iata}` : `powrotu ${iata} → KRK`);
  const missing = noFare.missing.map((leg) => `${legName(leg.leg)} ${windowText(leg)}`).join(" ani ");
  const sentences = [`Ryanair nie sprzedaje ${missing}.`];
  const found = noFare.available;
  if (found) {
    const name = found.leg === "outbound" ? `Wylot KRK → ${iata}` : `Powrót ${iata} → KRK`;
    const details = [found.number, found.departs].filter(Boolean).join(", ");
    sentences.push(`${name} ${formatDate(found.date)}: ${formatPln(found.amount)}${details ? ` (${details})` : ""}.`);
  }
  return sentences.join(" ");
}

/** "FR3799, 23 lis 2026" for one leg, legs joined with " + ". Return legs also show their own price. */
export function formatAutoFlights(autoFlights: string | null | undefined): string | null {
  if (!autoFlights) return null;
  const legs = autoFlights
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .map(([number, date, amount]) => {
      if (!date || !isIsoDate(date)) return number;
      const price = amount && Number.isFinite(Number(amount)) ? `, ${formatPln(Number(amount))}` : "";
      return number === "W6" ? `${formatDate(date)}${price}` : `${number}, ${formatDate(date)}${price}`;
    })
    .filter(Boolean);
  return legs.length > 0 ? legs.join(" + ") : null;
}

function flightKeys(autoFlights: string | null | undefined): string {
  return (autoFlights ?? "")
    .split(";")
    .map((part) => part.trim().split(/\s+/).slice(0, 2).join(" "))
    .join("; ");
}

function windowText(leg: LegWindow): string {
  return leg.from === leg.to ? formatDate(leg.from) : `${formatDate(leg.from)} – ${formatDate(leg.to)}`;
}

type LegResult =
  | { status: "ok"; fare: RyanairFare; day: RyanairFare[] | null }
  | { status: "none" }
  | { status: "failed"; reason: FlightReadFailure };

/** A range gives its cheapest fare. A single day also lists every flight that day. */
async function cheapestLeg(
  origin: string,
  destination: string,
  from: string,
  to: string,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<LegResult> {
  if (from === to) {
    const day = await listDayFlights(origin, destination, from, fetchImpl, signal);
    if (day.status !== "ok") return day;
    return { status: "ok", fare: day.flights[0], day: day.flights };
  }
  const read = await readCheapest(ryanairFaresUrl(origin, destination, from, to), from, to, fetchImpl, signal);
  if (read.status !== "ok") return read;
  return { status: "ok", fare: read.fare, day: null };
}

const DAY_REQUEST_LIMIT = 12;

/**
 * Ryanair answers with one fare per query, so the day is split around each flight found
 * (before it and after it) until no window returns another flight.
 */
export async function listDayFlights(
  origin: string,
  destination: string,
  date: string,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<{ status: "ok"; flights: RyanairFare[] } | { status: "none" } | { status: "failed"; reason: FlightReadFailure }> {
  const flights: RyanairFare[] = [];
  let windows = [{ from: "00:00", to: "23:59" }];
  let requests = 0;
  while (windows.length > 0 && requests < DAY_REQUEST_LIMIT) {
    const batch = windows.slice(0, DAY_REQUEST_LIMIT - requests);
    requests += batch.length;
    const results = await Promise.all(
      batch.map((hours) => readCheapest(ryanairFaresUrl(origin, destination, date, date, hours), date, date, fetchImpl, signal)),
    );
    const next: { from: string; to: string }[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "failed") {
        if (requests === 1) return result;
        continue;
      }
      if (result.status === "none" || !result.fare.departs) continue;
      if (flights.some((flight) => flight.departs === result.fare.departs && flight.number === result.fare.number)) continue;
      flights.push(result.fare);
      const hours = batch[index];
      const before = shiftClock(result.fare.departs, -1);
      const after = shiftClock(result.fare.departs, 1);
      if (before && before >= hours.from) next.push({ from: hours.from, to: before });
      if (after && after <= hours.to) next.push({ from: after, to: hours.to });
    }
    windows = next;
  }
  if (flights.length === 0) return { status: "none" };
  flights.sort((a, b) => a.amount - b.amount || (a.departs ?? "").localeCompare(b.departs ?? ""));
  return { status: "ok", flights };
}

async function readCheapest(
  url: string | null,
  from: string,
  to: string,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<{ status: "ok"; fare: RyanairFare } | { status: "none" } | { status: "failed"; reason: FlightReadFailure }> {
  if (!url) return { status: "failed", reason: "unreadable" };
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return { status: "failed", reason: read.reason };
  const fare = parseRyanairCheapest(read.payload, from, to);
  if (fare == null) return { status: "failed", reason: "unreadable" };
  if (fare === "none") return { status: "none" };
  return { status: "ok", fare };
}

function shiftClock(value: string, minutes: number): string | null {
  const [hours, mins] = value.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  if (!Number.isFinite(total) || total < 0 || total > 23 * 60 + 59) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function clock(value: string): string | null {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? null;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

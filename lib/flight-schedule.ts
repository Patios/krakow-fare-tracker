import type { Booking, BookingCheck, BookingLeg, LegCheck, ScheduledFlight } from "./bookings";
import type { Airline } from "./types";
import type { WizzData } from "./wizz-data";

const ORIGIN = "KRK";

export type DaySchedule =
  | { status: "ok"; flights: ScheduledFlight[] }
  | { status: "unpublished" }
  | { status: "failed" };

export function ryanairTimetableUrl(from: string, to: string, date: string): string {
  const [year, month] = date.split("-");
  return `https://www.ryanair.com/api/timtbl/3/schedules/${from}/${to}/years/${year}/months/${Number(month)}`;
}

/** One day from Ryanair's monthly timetable. An empty month means it is not published yet. */
export function parseRyanairMonth(payload: unknown, date: string): DaySchedule {
  const days = (payload as { days?: unknown } | null)?.days;
  if (!Array.isArray(days)) return { status: "failed" };
  if (days.length === 0) return { status: "unpublished" };
  const dayNumber = Number(date.slice(8, 10));
  const day = days.find((item) => (item as { day?: unknown })?.day === dayNumber) as { flights?: unknown } | undefined;
  const flights = Array.isArray(day?.flights) ? day.flights : [];
  return {
    status: "ok",
    flights: flights
      .map((flight) => {
        const item = flight as { carrierCode?: unknown; number?: unknown; departureTime?: unknown; arrivalTime?: unknown };
        if (typeof item.departureTime !== "string") return null;
        return {
          number: typeof item.number === "string" ? `${typeof item.carrierCode === "string" ? item.carrierCode : "FR"}${item.number}` : null,
          depart: item.departureTime,
          arrive: typeof item.arrivalTime === "string" ? item.arrivalTime : null,
        };
      })
      .filter((flight): flight is ScheduledFlight => flight != null)
      .sort((a, b) => a.depart.localeCompare(b.depart)),
  };
}

/** Wizz departures from the published timetable file. Wizz gives no flight numbers or arrival times there. */
export function wizzDay(data: WizzData | null, destinationIata: string, direction: "out" | "back", date: string): DaySchedule {
  if (!data) return { status: "failed" };
  if (date > data.through) return { status: "unpublished" };
  const fares = data.fares[destinationIata];
  if (!fares) return { status: "ok", flights: [] };
  const day = fares[direction].find((item) => item[0] === date);
  return { status: "ok", flights: (day?.[2] ?? []).map((depart) => ({ number: null, depart, arrive: null })) };
}

export async function loadDay(
  airline: Airline,
  destinationIata: string,
  direction: "out" | "back",
  date: string,
  wizz: WizzData | null,
  fetchImpl: typeof fetch = fetch,
): Promise<DaySchedule> {
  if (airline === "wizzair") return wizzDay(wizz, destinationIata, direction, date);
  const [from, to] = direction === "out" ? [ORIGIN, destinationIata] : [destinationIata, ORIGIN];
  try {
    const response = await fetchImpl(ryanairTimetableUrl(from, to, date), { headers: { Accept: "application/json" } });
    if (!response.ok) return { status: "failed" };
    return parseRyanairMonth(await response.json(), date);
  } catch {
    return { status: "failed" };
  }
}

/** Finds the booked flight in the day's timetable: by number first, then by departure time. */
export function compareLeg(leg: BookingLeg, day: DaySchedule): LegCheck {
  if (day.status !== "ok") return day;
  const flights = day.flights;
  const number = flights.some((flight) => flight.number) ? leg.flightNumber : null;
  const byNumber = number ? flights.find((flight) => flight.number === number) : undefined;
  const byTime = leg.depart ? flights.find((flight) => flight.depart === leg.depart) : undefined;
  const match = byNumber ?? byTime ?? (!number && !leg.depart && flights.length === 1 ? flights[0] : undefined);
  if (!match) {
    // A single flight that day under another time is most likely the same flight moved.
    if (!number && flights.length === 1) return { status: "changed", flight: flights[0] };
    return { status: "missing", others: flights };
  }
  const moved = (leg.depart != null && leg.depart !== match.depart) || (leg.arrive != null && match.arrive != null && leg.arrive !== match.arrive);
  return { status: moved ? "changed" : "ok", flight: match };
}

export async function checkBooking(
  booking: Booking,
  wizz: WizzData | null,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<BookingCheck> {
  const [outbound, inbound] = await Promise.all([
    booking.outbound ? loadDay(booking.airline, booking.destinationIata, "out", booking.outbound.date, wizz, fetchImpl) : null,
    booking.return ? loadDay(booking.airline, booking.destinationIata, "back", booking.return.date, wizz, fetchImpl) : null,
  ]);
  return {
    checkedAt: now.toISOString(),
    outbound: booking.outbound && outbound ? compareLeg(booking.outbound, outbound) : null,
    return: booking.return && inbound ? compareLeg(booking.return, inbound) : null,
  };
}

/** Writes the timetable times into the booking after the user accepts a change. */
export function acceptSchedule(booking: Booking): Booking {
  const apply = (leg: BookingLeg | null, check: LegCheck | null | undefined): BookingLeg | null => {
    if (!leg || !check || check.status !== "changed") return leg;
    return {
      ...leg,
      flightNumber: check.flight.number ?? leg.flightNumber,
      depart: check.flight.depart,
      arrive: check.flight.arrive ?? leg.arrive,
    };
  };
  const check = booking.lastCheck;
  if (!check) return booking;
  return {
    ...booking,
    outbound: apply(booking.outbound, check.outbound),
    return: apply(booking.return, check.return),
    lastCheck: {
      ...check,
      outbound: settled(check.outbound),
      return: settled(check.return),
    },
  };
}

function settled(check: LegCheck | null): LegCheck | null {
  return check?.status === "changed" ? { status: "ok", flight: check.flight } : check;
}

import { isIsoDate, parseTimeInput, roundMoney } from "./format";
import type { Airline } from "./types";

export const BOOKINGS_KEY = "krk-fare-tracker.bookings.v1";

export type BookingLeg = {
  date: string;
  /** "FR3505" or "W61234". Wizz numbers are optional because its timetable has none. */
  flightNumber: string | null;
  depart: string | null;
  arrive: string | null;
};

export type ScheduledFlight = { number: string | null; depart: string; arrive: string | null };

export type LegCheck =
  /** The booked flight is in the timetable with the booked times. */
  | { status: "ok"; flight: ScheduledFlight }
  /** The booked flight is in the timetable with other times. */
  | { status: "changed"; flight: ScheduledFlight }
  /** The month is published, but the booked flight is not in it. */
  | { status: "missing"; others: ScheduledFlight[] }
  /** The airline has not published that month yet. */
  | { status: "unpublished" }
  /** The timetable did not answer. */
  | { status: "failed" };

export type BookingCheck = { checkedAt: string; outbound: LegCheck | null; return: LegCheck | null };

export type Booking = {
  id: string;
  airline: Airline;
  destinationIata: string;
  /** Null for a booking with only the flight back to KRK. */
  outbound: BookingLeg | null;
  return: BookingLeg | null;
  /** Booking reference (PNR) from the airline e-mail. */
  reference: string | null;
  paid: number | null;
  passengers: number;
  createdAt: string;
  lastCheck: BookingCheck | null;
};

export type BookingDraft = Omit<Booking, "id" | "createdAt" | "lastCheck">;

export function normalizeFlightNumber(raw: string, airline: Airline): string | null {
  const compact = raw.replace(/\s/g, "").toUpperCase();
  if (!compact) return null;
  const digits = /^(?:FR|RK|W6|W4|W9)?(\d{1,4})$/.exec(compact)?.[1];
  if (!digits) return null;
  const prefix = /^(RK|W4|W9)/.exec(compact)?.[1] ?? (airline === "ryanair" ? "FR" : "W6");
  return `${prefix}${digits}`;
}

export function bookingLegs(booking: Booking): BookingLeg[] {
  return [booking.outbound, booking.return].filter((leg): leg is BookingLeg => leg != null);
}

/** The last day of the trip: the return day, or the outbound day for a one-way booking. */
export function lastBookingDay(booking: Booking): string {
  const legs = bookingLegs(booking);
  return legs[legs.length - 1].date;
}

/** The next flight of the booking from today, or its last one when everything has flown. */
export function nextBookingLeg(booking: Booking, today: string): BookingLeg {
  const legs = bookingLegs(booking);
  return legs.find((leg) => leg.date >= today) ?? legs[legs.length - 1];
}

export function bookingFlown(booking: Booking, today: string): boolean {
  return lastBookingDay(booking) < today;
}

/** Upcoming bookings soonest first, flown ones most recent first. */
export function splitBookings(bookings: Booking[], today: string): { upcoming: Booking[]; flown: Booking[] } {
  const upcoming = bookings
    .filter((booking) => !bookingFlown(booking, today))
    .sort((a, b) => {
      const first = nextBookingLeg(a, today);
      const second = nextBookingLeg(b, today);
      return first.date.localeCompare(second.date) || (first.depart ?? "").localeCompare(second.depart ?? "");
    });
  const flown = bookings
    .filter((booking) => bookingFlown(booking, today))
    .sort((a, b) => lastBookingDay(b).localeCompare(lastBookingDay(a)));
  return { upcoming, flown };
}

/** "dziś", "jutro", "za 5 dni". */
export function daysUntilLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  if (days < 0) return days === -1 ? "wczoraj" : `${-days} dni temu`;
  return `za ${days} dni`;
}

export function parseBookings(raw: string): Booking[] {
  if (raw === "") return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("corrupt");
  return parsed.map(readBooking).filter((booking): booking is Booking => booking != null);
}

export function readBooking(value: unknown): Booking | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Booking>;
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  if (item.airline !== "ryanair" && item.airline !== "wizzair") return null;
  if (typeof item.destinationIata !== "string" || !/^[A-Z]{3}$/.test(item.destinationIata)) return null;
  const outbound = item.outbound == null ? null : readLeg(item.outbound);
  if (item.outbound != null && !outbound) return null;
  const inbound = item.return == null ? null : readLeg(item.return);
  if (item.return != null && !inbound) return null;
  if (!outbound && !inbound) return null;
  if (outbound && inbound && inbound.date < outbound.date) return null;
  if (typeof item.createdAt !== "string") return null;
  const paid = typeof item.paid === "number" && Number.isFinite(item.paid) && item.paid > 0 ? roundMoney(item.paid) : null;
  return {
    id: item.id,
    airline: item.airline,
    destinationIata: item.destinationIata,
    outbound,
    return: inbound,
    reference: typeof item.reference === "string" && item.reference.trim() ? item.reference.trim().toUpperCase() : null,
    paid,
    passengers: Number.isInteger(item.passengers) && (item.passengers as number) > 0 ? (item.passengers as number) : 1,
    createdAt: item.createdAt,
    lastCheck: readCheck(item.lastCheck),
  };
}

function readLeg(value: unknown): BookingLeg | null {
  if (!value || typeof value !== "object") return null;
  const leg = value as Partial<BookingLeg>;
  if (typeof leg.date !== "string" || !isIsoDate(leg.date)) return null;
  const depart = readTime(leg.depart);
  const arrive = readTime(leg.arrive);
  if (depart === "invalid" || arrive === "invalid") return null;
  return {
    date: leg.date,
    flightNumber: typeof leg.flightNumber === "string" && leg.flightNumber ? leg.flightNumber : null,
    depart,
    arrive,
  };
}

function readTime(value: unknown): string | null | "invalid" {
  if (value == null || value === "") return null;
  return typeof value === "string" ? parseTimeInput(value) : "invalid";
}

const LEG_STATUSES = new Set(["ok", "changed", "missing", "unpublished", "failed"]);

function readCheck(value: unknown): BookingCheck | null {
  if (!value || typeof value !== "object") return null;
  const check = value as Partial<BookingCheck>;
  if (typeof check.checkedAt !== "string") return null;
  const valid = (leg: unknown): leg is LegCheck =>
    !!leg && typeof leg === "object" && LEG_STATUSES.has((leg as { status?: string }).status ?? "");
  const outbound = valid(check.outbound) ? check.outbound : null;
  const inbound = valid(check.return) ? check.return : null;
  if (!outbound && !inbound) return null;
  return { checkedAt: check.checkedAt, outbound, return: inbound };
}

const LOADING = "__loading__";
const BLOCKED = "__blocked__";
const listeners = new Set<() => void>();

export function subscribeBookings(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === BOOKINGS_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getBookingsSnapshot(): string {
  try {
    return localStorage.getItem(BOOKINGS_KEY) ?? "";
  } catch {
    return BLOCKED;
  }
}

export function getBookingsServerSnapshot(): string {
  return LOADING;
}

export type BookingsView = { status: "loading" } | { status: "error" } | { status: "ready"; bookings: Booking[] };

export function interpretBookings(snapshot: string): BookingsView {
  if (snapshot === LOADING) return { status: "loading" };
  if (snapshot === BLOCKED) return { status: "error" };
  try {
    return { status: "ready", bookings: parseBookings(snapshot) };
  } catch {
    return { status: "error" };
  }
}

export function readLocalBookings(): Booking[] {
  const view = interpretBookings(getBookingsSnapshot());
  return view.status === "ready" ? view.bookings : [];
}

export function saveBookings(bookings: Booking[]) {
  if (bookings.length === 0) localStorage.removeItem(BOOKINGS_KEY);
  else localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
  for (const listener of listeners) listener();
}

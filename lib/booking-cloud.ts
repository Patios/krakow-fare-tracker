import { readBooking, readLocalBookings, saveBookings, type Booking } from "./bookings";
import { getSupabase } from "./supabase";

const TABLE = "fare_bookings";
const ACK_KEY = "krk-fare-tracker.bookings-ack";

export type BookingCloudSnapshot = { syncing: boolean; error: string | null };

let snapshot: BookingCloudSnapshot = { syncing: false, error: null };
const serverSnapshot: BookingCloudSnapshot = snapshot;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();

export function subscribeBookingCloud(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBookingCloudSnapshot() {
  return snapshot;
}

export function getBookingCloudServerSnapshot() {
  return serverSnapshot;
}

function patch(next: Partial<BookingCloudSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function enqueue(task: () => Promise<void>) {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

type BookingRow = {
  id: string;
  airline: string;
  destination_iata: string;
  outbound_date: string | null;
  outbound_flight: string | null;
  outbound_depart: string | null;
  outbound_arrive: string | null;
  return_date: string | null;
  return_flight: string | null;
  return_depart: string | null;
  return_arrive: string | null;
  reference: string | null;
  paid: number | string | null;
  passengers: number | null;
  last_check: unknown;
  created_at: string;
};

export function bookingToRow(booking: Booking): BookingRow {
  return {
    id: booking.id,
    airline: booking.airline,
    destination_iata: booking.destinationIata,
    outbound_date: booking.outbound?.date ?? null,
    outbound_flight: booking.outbound?.flightNumber ?? null,
    outbound_depart: booking.outbound?.depart ?? null,
    outbound_arrive: booking.outbound?.arrive ?? null,
    return_date: booking.return?.date ?? null,
    return_flight: booking.return?.flightNumber ?? null,
    return_depart: booking.return?.depart ?? null,
    return_arrive: booking.return?.arrive ?? null,
    reference: booking.reference,
    paid: booking.paid,
    passengers: booking.passengers,
    last_check: booking.lastCheck,
    created_at: booking.createdAt,
  };
}

export function bookingFromRow(row: BookingRow): Booking | null {
  return readBooking({
    id: row.id,
    airline: row.airline,
    destinationIata: row.destination_iata,
    outbound: row.outbound_date
      ? { date: row.outbound_date, flightNumber: row.outbound_flight, depart: row.outbound_depart, arrive: row.outbound_arrive }
      : null,
    return: row.return_date
      ? { date: row.return_date, flightNumber: row.return_flight, depart: row.return_depart, arrive: row.return_arrive }
      : null,
    reference: row.reference,
    paid: row.paid == null ? null : Number(row.paid),
    passengers: row.passengers ?? 1,
    lastCheck: row.last_check,
    createdAt: row.created_at,
  });
}

/**
 * After a sync that went through, the account is the source of truth.
 * Without one (first sign-in here, or a failed save) bookings in this browser are uploaded and win.
 */
export function syncBookings(userId: string) {
  return enqueue(async () => {
    const db = getSupabase();
    if (!db) return;
    patch({ syncing: true });
    const { data, error } = await db.from(TABLE).select("*");
    if (error) return fail(error.message);
    const remote = (data as BookingRow[]).map(bookingFromRow).filter((booking): booking is Booking => booking != null);
    let next = remote;
    if (readAck() !== userId) {
      const local = readLocalBookings();
      if (local.length > 0) {
        const { error: uploadError } = await db.from(TABLE).upsert(local.map(bookingToRow));
        if (uploadError) return fail(uploadError.message);
      }
      next = [...remote.filter((item) => local.every((mine) => mine.id !== item.id)), ...local];
    }
    saveBookings(next);
    writeAck(userId);
    patch({ syncing: false, error: null });
  });
}

export function persistBooking(booking: Booking) {
  return enqueue(async () => {
    const db = getSupabase();
    if (!db || readAck() == null) return;
    const { error } = await db.from(TABLE).upsert(bookingToRow(booking));
    if (error) fail(error.message);
  });
}

export function removeBookingRow(id: string) {
  return enqueue(async () => {
    const db = getSupabase();
    if (!db || readAck() == null) return;
    const { error } = await db.from(TABLE).delete().eq("id", id);
    if (error) fail(error.message);
  });
}

/** Called on sign-out, so the next person on this browser starts empty. */
export function forgetBookings() {
  forgetAck();
  saveBookings([]);
  patch({ syncing: false, error: null });
}

function fail(message: string) {
  forgetAck();
  patch({
    syncing: false,
    error: /fare_bookings|schema cache|does not exist/i.test(message)
      ? "W Supabase nie ma jeszcze tabeli rezerwacji. Uruchom raz skrypt supabase/bookings.sql w SQL Editor. Do tego czasu rezerwacje zostają w tej przeglądarce."
      : "Nie udało się zapisać rezerwacji na koncie. Zostaje kopia w tej przeglądarce.",
  });
}

function readAck(): string | null {
  try {
    return localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
}

function writeAck(userId: string) {
  try {
    localStorage.setItem(ACK_KEY, userId);
  } catch {
    // The next sync merges again.
  }
}

function forgetAck() {
  try {
    localStorage.removeItem(ACK_KEY);
  } catch {
    // Nothing to forget in a blocked storage area.
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { bookingFromRow, bookingToRow } from "./booking-cloud";
import { daysUntilLabel, normalizeFlightNumber, parseBookings, splitBookings, type Booking } from "./bookings";
import { acceptSchedule, checkBooking, compareLeg, parseRyanairMonth, wizzDay } from "./flight-schedule";
import type { WizzData } from "./wizz-data";

const TODAY = "2026-11-04";

const OUTBOUND = { date: "2026-11-05", flightNumber: "FR3505", depart: "07:00", arrive: "08:50" };

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "b1",
    airline: "ryanair",
    destinationIata: "BGY",
    outbound: OUTBOUND,
    return: { date: "2026-11-06", flightNumber: "FR3504", depart: "09:15", arrive: "11:00" },
    reference: "AB1CDE",
    paid: 389.98,
    passengers: 1,
    createdAt: "2026-11-01T10:00:00.000Z",
    lastCheck: null,
    ...overrides,
  };
}

const MONTH_OUT = {
  month: 11,
  days: [
    { day: 4, flights: [{ carrierCode: "FR", number: "3505", departureTime: "14:40", arrivalTime: "16:30" }] },
    {
      day: 5,
      flights: [
        { carrierCode: "FR", number: "889", departureTime: "15:15", arrivalTime: "17:05" },
        { carrierCode: "FR", number: "3505", departureTime: "07:20", arrivalTime: "09:10" },
      ],
    },
  ],
};

test("flight numbers are read the way they appear on a ticket", () => {
  assert.equal(normalizeFlightNumber("fr 3505", "ryanair"), "FR3505");
  assert.equal(normalizeFlightNumber("3505", "ryanair"), "FR3505");
  assert.equal(normalizeFlightNumber("1234", "wizzair"), "W61234");
  assert.equal(normalizeFlightNumber("RK 1503", "ryanair"), "RK1503");
  assert.equal(normalizeFlightNumber("ABC", "ryanair"), null);
});

test("the Ryanair month gives that day's flights; an empty month is not published", () => {
  assert.deepEqual(parseRyanairMonth(MONTH_OUT, "2026-11-05"), {
    status: "ok",
    flights: [
      { number: "FR3505", depart: "07:20", arrive: "09:10" },
      { number: "FR889", depart: "15:15", arrive: "17:05" },
    ],
  });
  assert.deepEqual(parseRyanairMonth(MONTH_OUT, "2026-11-07"), { status: "ok", flights: [] });
  assert.deepEqual(parseRyanairMonth({ month: 12, days: [] }, "2026-12-01"), { status: "unpublished" });
  assert.deepEqual(parseRyanairMonth(null, "2026-12-01"), { status: "failed" });
});

test("a booked flight is matched by number and reports a time change", () => {
  const day = parseRyanairMonth(MONTH_OUT, "2026-11-05");
  const leg = OUTBOUND;
  assert.deepEqual(compareLeg(leg, day), { status: "changed", flight: { number: "FR3505", depart: "07:20", arrive: "09:10" } });
  assert.deepEqual(compareLeg({ ...leg, depart: "07:20", arrive: "09:10" }, day).status, "ok");
  assert.deepEqual(compareLeg({ ...leg, flightNumber: "FR1234" }, day), {
    status: "missing",
    others: [
      { number: "FR3505", depart: "07:20", arrive: "09:10" },
      { number: "FR889", depart: "15:15", arrive: "17:05" },
    ],
  });
  assert.deepEqual(compareLeg(leg, { status: "unpublished" }), { status: "unpublished" });
});

test("Wizz legs match by departure time, and a single flight at another time counts as moved", () => {
  const wizz = {
    checkedAt: "2026-11-04T06:00:00.000Z",
    apiVersion: "",
    through: "2027-06-30",
    destinations: [],
    fares: { MXP: { out: [["2026-11-05", null, ["19:00"], 679]], back: [] } },
  } as unknown as WizzData;
  const day = wizzDay(wizz, "MXP", "out", "2026-11-05");
  const leg = { date: "2026-11-05", flightNumber: "W61234", depart: "19:00", arrive: "20:55" };
  assert.deepEqual(compareLeg(leg, day), { status: "ok", flight: { number: null, depart: "19:00", arrive: null } });
  assert.deepEqual(compareLeg({ ...leg, depart: "18:30" }, day).status, "changed");
  assert.deepEqual(wizzDay(wizz, "MXP", "out", "2027-08-01"), { status: "unpublished" });
  assert.deepEqual(wizzDay(wizz, "MXP", "out", "2026-11-06"), { status: "ok", flights: [] });
});

test("checking a booking asks for both legs and accepting writes the new times", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    const back = { month: 11, days: [{ day: 6, flights: [{ carrierCode: "FR", number: "3504", departureTime: "09:15", arrivalTime: "11:00" }] }] };
    return new Response(JSON.stringify(url.includes("/BGY/KRK/") ? back : MONTH_OUT));
  }) as typeof fetch;
  const check = await checkBooking(booking(), null, new Date("2026-11-04T12:00:00.000Z"), fetchImpl);
  assert.deepEqual(urls, [
    "https://www.ryanair.com/api/timtbl/3/schedules/KRK/BGY/years/2026/months/11",
    "https://www.ryanair.com/api/timtbl/3/schedules/BGY/KRK/years/2026/months/11",
  ]);
  assert.equal(check.outbound?.status, "changed");
  assert.equal(check.return?.status, "ok");

  const accepted = acceptSchedule(booking({ lastCheck: check }));
  assert.deepEqual(accepted.outbound, { date: "2026-11-05", flightNumber: "FR3505", depart: "07:20", arrive: "09:10" });
  assert.equal(accepted.lastCheck?.outbound?.status, "ok");
});

test("bookings split into upcoming and flown, and survive storage and the database row", () => {
  const flown = booking({ id: "old", outbound: { ...OUTBOUND, date: "2026-10-01" }, return: null });
  const later = booking({ id: "later", outbound: { ...OUTBOUND, date: "2026-12-01" }, return: null });
  const away = booking({ id: "away", outbound: { ...OUTBOUND, date: "2026-11-01" } });
  const { upcoming, flown: past } = splitBookings([later, flown, booking(), away], TODAY);
  assert.deepEqual(upcoming.map((item) => item.id), ["b1", "away", "later"]);
  assert.deepEqual(past.map((item) => item.id), ["old"]);

  assert.equal(daysUntilLabel("2026-11-04", TODAY), "dziś");
  assert.equal(daysUntilLabel("2026-11-05", TODAY), "jutro");
  assert.equal(daysUntilLabel("2026-11-14", TODAY), "za 10 dni");

  assert.deepEqual(parseBookings(JSON.stringify([booking()])), [booking()]);
  assert.deepEqual(parseBookings(""), []);
  assert.throws(() => parseBookings("{"));

  const row = bookingToRow(booking());
  assert.deepEqual(bookingFromRow({ ...row, paid: "389.98", outbound_depart: "07:00:00", outbound_arrive: "08:50:00" }), booking());
});

test("a booking with only the flight back to KRK checks just that leg and keeps its passengers", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ month: 11, days: [] }));
  }) as typeof fetch;
  const homeOnly = booking({ id: "home", outbound: null, passengers: 4 });
  const check = await checkBooking(homeOnly, null, new Date("2026-11-04T12:00:00.000Z"), fetchImpl);
  assert.deepEqual(urls, ["https://www.ryanair.com/api/timtbl/3/schedules/BGY/KRK/years/2026/months/11"]);
  assert.equal(check.outbound, null);
  assert.equal(check.return?.status, "unpublished");

  const stored = { ...homeOnly, lastCheck: check };
  assert.deepEqual(parseBookings(JSON.stringify([stored])), [stored]);
  assert.deepEqual(bookingFromRow(bookingToRow(stored)), stored);
  assert.deepEqual(parseBookings(JSON.stringify([{ ...homeOnly, return: null }])), []);
  const legacy: Record<string, unknown> = { ...booking() };
  delete legacy.passengers;
  assert.equal(parseBookings(JSON.stringify([legacy]))[0].passengers, 1);
  assert.deepEqual(splitBookings([homeOnly], "2026-11-06").upcoming.map((item) => item.id), ["home"]);
});

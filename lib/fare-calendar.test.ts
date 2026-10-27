import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPickedFlights,
  cheapestDay,
  confirmLeg,
  monthGrid,
  parseRyanairMonth,
  ryanairMonthUrl,
  shiftMonth,
} from "./fare-calendar";
import type { WatchedRoute } from "./types";

const decemberPayload = {
  outbound: {
    fares: [
      { day: "2026-12-01", departureDate: null, arrivalDate: null, price: null, soldOut: false, unavailable: true },
      {
        day: "2026-12-02",
        departureDate: "2026-12-02T13:00:00",
        arrivalDate: "2026-12-02T16:50:00",
        price: { value: 220.01, currencyCode: "PLN" },
        soldOut: false,
      },
      {
        day: "2026-12-03",
        departureDate: "2026-12-03T10:05:00",
        arrivalDate: "2026-12-03T13:55:00",
        price: { value: 202.41, currencyCode: "PLN" },
        soldOut: false,
      },
      { day: "2026-12-04", departureDate: null, arrivalDate: null, price: null, soldOut: true },
      { day: "2027-01-01", price: { value: 10, currencyCode: "PLN" } },
    ],
  },
};

test("the month view keeps each day of that month with its fare and hours", () => {
  const days = parseRyanairMonth(decemberPayload, "2026-12-01");
  assert.ok(days);
  assert.equal(days.length, 4);
  assert.deepEqual(days[2], { date: "2026-12-03", status: "fare", amount: 202.41, departs: "10:05", arrives: "13:55" });
  assert.equal(days[0].status, "none");
  assert.equal(days[3].status, "sold-out");
  assert.equal(parseRyanairMonth({}, "2026-12-01"), null);
});

test("the cheapest day skips days before the earliest allowed date", () => {
  const days = parseRyanairMonth(decemberPayload, "2026-12-01") ?? [];
  assert.equal(cheapestDay(days, "2026-12-01")?.date, "2026-12-03");
  assert.equal(cheapestDay(days, "2026-12-04"), null);
});

test("months shift across years and the grid starts on Monday", () => {
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2027-01-01", -1), "2026-12-01");
  const december = monthGrid("2026-12-01");
  assert.equal(december[0], null);
  assert.equal(december[1], "2026-12-01");
  assert.equal(december.at(-1), "2026-12-31");
  assert.match(ryanairMonthUrl("KRK", "AGP", "2026-12-15") ?? "", /KRK\/AGP\/cheapestPerDay\?outboundMonthOfDate=2026-12-01/);
});

test("confirming a day reads its flight number and keeps the calendar fare when that fails", async () => {
  const day = { date: "2026-12-03", status: "fare" as const, amount: 202.41, departs: "10:05", arrives: "13:55" };
  const ok = async () =>
    new Response(
      JSON.stringify({
        fares: [
          {
            outbound: {
              departureDate: "2026-12-03T10:05:00",
              arrivalDate: "2026-12-03T13:55:00",
              flightNumber: "FR2589",
              price: { value: 205, currencyCode: "PLN" },
            },
          },
        ],
      }),
    );
  assert.deepEqual(await confirmLeg("KRK", "AGP", day, ok), {
    date: "2026-12-03",
    amount: 205,
    departs: "10:05",
    arrives: "13:55",
    number: "FR2589",
  });
  const blocked = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.equal((await confirmLeg("KRK", "AGP", day, blocked))?.number, "");
});

test("picked flights move the route to that day and log the sum of both legs", () => {
  const route: WatchedRoute = {
    id: "r1",
    destinationIata: "AGP",
    outboundFrom: "2026-12-01",
    outboundTo: "2026-12-10",
    returnDate: "2026-12-12",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const { route: next, log } = applyPickedFlights(
    route,
    { date: "2026-12-03", amount: 202.41, departs: "10:05", arrives: "13:55", number: "FR2589" },
    { date: "2026-12-12", amount: 150.3, departs: "14:30", arrives: "18:20", number: "FR2590" },
    "2026-10-27",
    new Date("2026-10-27T09:00:00.000Z"),
  );
  assert.equal(next.outboundFrom, "2026-12-03");
  assert.equal(next.outboundTo, null);
  assert.equal(next.returnDate, "2026-12-12");
  assert.equal(next.returnDepart, "14:30");
  assert.equal(log.amount, 352.71);
  assert.equal(log.autoFlights, "FR2589 2026-12-03; FR2590 2026-12-12");
  assert.equal(log.routeId, "r1");
});

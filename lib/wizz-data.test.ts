import assert from "node:assert/strict";
import test from "node:test";
import { parseWizzData, parseWizzTimetable, quoteWizz, type WizzData } from "./wizz-data";
import type { PriceLog, WatchedRoute } from "./types";

const TODAY = "2026-10-29";
const NOW = () => new Date("2026-10-29T19:00:00.000Z");

function flight(date: string, amount: number, priceType = "price", times = ["19:00"]) {
  return {
    departureStation: "KRK",
    arrivalStation: "MXP",
    departureDate: `${date}T00:00:00`,
    price: { amount, currencyCode: "PLN" },
    originalPrice: { amount: 679, currencyCode: "PLN" },
    priceType,
    departureDates: times.map((time) => `${date}T${time}:00`),
  };
}

function data(): WizzData {
  return {
    checkedAt: "2026-10-29T18:00:00.000Z",
    apiVersion: "29.22.0",
    through: "2027-06-26",
    destinations: [{ iata: "MXP", city: "Mediolan Malpensa", country: "Włochy", startsOn: null }],
    fares: {
      MXP: {
        out: [
          ["2026-11-05", null, ["19:00"], 679],
          ["2026-11-06", 279, ["19:00"]],
          ["2026-11-07", 169, ["19:00"]],
        ],
        back: [
          ["2026-11-06", 259, ["21:30"]],
          ["2026-11-09", 169, ["21:30"]],
        ],
      },
    },
  };
}

function route(overrides: Partial<WatchedRoute> = {}): WatchedRoute {
  return {
    id: "mxp",
    destinationIata: "MXP",
    outboundFrom: "2026-11-06",
    outboundTo: null,
    returnDate: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

test("the timetable keeps priced days and gives check-price days only their earlier fare", () => {
  const parsed = parseWizzTimetable({
    outboundFlights: [flight("2026-11-06", 279), flight("2026-11-05", 0, "checkPrice"), flight("2026-11-07", 169, "price", ["21:00", "07:10"])],
    returnFlights: null,
  });
  assert.deepEqual(parsed, {
    out: [
      ["2026-11-05", null, ["19:00"], 679],
      ["2026-11-06", 279, ["19:00"]],
      ["2026-11-07", 169, ["07:10", "21:00"]],
    ],
    back: [],
  });
  assert.equal(parseWizzTimetable({ outboundFlights: "nope" }), null);
});

test("the published file is checked before use", () => {
  assert.deepEqual(parseWizzData(JSON.parse(JSON.stringify(data()))), data());
  assert.equal(parseWizzData({ checkedAt: 1 }), null);
});

test("a return trip adds the cheapest outbound day and the return day", () => {
  const outcome = quoteWizz(route({ outboundTo: "2026-11-07", returnDate: "2026-11-09" }), [], data(), TODAY, NOW);
  assert.equal(outcome.status, "saved");
  if (outcome.status !== "saved") return;
  assert.equal(outcome.log.airline, "wizzair");
  assert.equal(outcome.log.amount, 338);
  assert.equal(outcome.log.outboundDepart, "19:00");
  assert.equal(outcome.log.returnDepart, "21:30");
  assert.equal(outcome.log.autoFlights, "W6 2026-11-07 169; W6 2026-11-09 169");
});

test("a check-price day keeps its earlier fare as a hint, a day without flights is missing", () => {
  assert.deepEqual(quoteWizz(route({ outboundFrom: "2026-11-05" }), [], data(), TODAY, NOW), {
    status: "no-fare",
    missing: [{ leg: "outbound", from: "2026-11-05", to: "2026-11-05", unpriced: true, earlier: 679 }],
  });
  assert.deepEqual(quoteWizz(route({ outboundFrom: "2026-11-06", returnDate: "2026-11-08" }), [], data(), TODAY, NOW), {
    status: "no-fare",
    missing: [{ leg: "return", from: "2026-11-08", to: "2026-11-08", unpriced: false, earlier: null }],
  });
});

test("routes outside the file, past dates and repeated prices save nothing", () => {
  assert.deepEqual(quoteWizz(route({ destinationIata: "STN" }), [], data(), TODAY), { status: "not-served" });
  assert.deepEqual(quoteWizz(route(), [], null, TODAY), { status: "no-data" });
  assert.deepEqual(quoteWizz(route({ outboundFrom: "2026-10-20" }), [], data(), TODAY), { status: "past" });
  assert.deepEqual(quoteWizz(route({ outboundFrom: "2027-08-01" }), [], data(), TODAY), { status: "no-data" });

  const existing: PriceLog = {
    id: "l1",
    routeId: "mxp",
    airline: "wizzair",
    amount: 279,
    currency: "PLN",
    checkedOn: TODAY,
    createdAt: "2026-10-29T10:00:00.000Z",
    outboundDepart: "19:00",
    outboundArrive: null,
    returnDepart: null,
    returnArrive: null,
    autoFlights: "W6 2026-11-06",
  };
  assert.deepEqual(quoteWizz(route(), [existing], data(), TODAY), { status: "unchanged", amount: 279 });
});

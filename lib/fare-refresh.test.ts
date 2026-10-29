import assert from "node:assert/strict";
import test from "node:test";
import { formatAutoFlights, noFareText, parseRyanairCheapest, refreshRyanairPrice } from "./fare-refresh";
import type { PriceLog, WatchedRoute } from "./types";

const TODAY = "2026-10-27";
const NOW = () => new Date("2026-10-27T09:00:00.000Z");

function fare(date: string, value: number, number = "FR1", depart = "10:05", arrive = "13:55") {
  return {
    outbound: {
      departureDate: `${date}T${depart}:00`,
      arrivalDate: `${date}T${arrive}:00`,
      flightNumber: number,
      price: { value, currencyCode: "PLN" },
    },
  };
}

function route(overrides: Partial<WatchedRoute> = {}): WatchedRoute {
  return {
    id: "r1",
    destinationIata: "AGP",
    outboundFrom: "2026-12-01",
    outboundTo: "2026-12-31",
    returnDate: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetch(byOrigin: Record<string, unknown>) {
  const urls: string[] = [];
  const fetchImpl = async (input: string) => {
    urls.push(input);
    const origin = new URL(input).searchParams.get("departureAirportIataCode") ?? "";
    return new Response(JSON.stringify(byOrigin[origin] ?? { fares: [] }), { status: 200 });
  };
  return { fetchImpl, urls };
}

test("the parser picks the cheapest PLN fare inside the window", () => {
  const payload = {
    fares: [fare("2026-12-03", 202.41, "FR2589"), fare("2026-11-30", 99, "FR0"), fare("2026-12-10", 250)],
  };
  assert.deepEqual(parseRyanairCheapest(payload, "2026-12-01", "2026-12-31"), {
    amount: 202.41,
    date: "2026-12-03",
    number: "FR2589",
    departs: "10:05",
    arrives: "13:55",
  });
  assert.equal(parseRyanairCheapest({ fares: [] }, "2026-12-01", "2026-12-31"), "none");
  assert.equal(parseRyanairCheapest({ nope: true }, "2026-12-01", "2026-12-31"), null);
});

test("a one-way range saves the cheapest fare with its flight and hours", async () => {
  const { fetchImpl, urls } = mockFetch({ KRK: { fares: [fare("2026-12-03", 202.41, "FR2589")] } });
  const outcome = await refreshRyanairPrice(route(), [], TODAY, fetchImpl, undefined, NOW);
  assert.equal(outcome.status, "saved");
  if (outcome.status !== "saved") return;
  assert.equal(outcome.log.amount, 202.41);
  assert.equal(outcome.log.airline, "ryanair");
  assert.equal(outcome.log.checkedOn, TODAY);
  assert.equal(outcome.log.outboundDepart, "10:05");
  assert.equal(outcome.log.returnDepart, null);
  assert.equal(outcome.log.autoFlights, "FR2589 2026-12-03");
  assert.equal(urls.length, 1);
  assert.match(urls[0], /outboundDepartureDateFrom=2026-12-01&outboundDepartureDateTo=2026-12-31/);
});

test("a return trip adds two one-way fares and asks for the return day only", async () => {
  const { fetchImpl, urls } = mockFetch({
    KRK: { fares: [fare("2026-12-03", 202.41, "FR2589")] },
    AGP: { fares: [fare("2026-12-08", 150.3, "FR2590", "14:30", "18:20")] },
  });
  const outcome = await refreshRyanairPrice(
    route({ outboundTo: null, outboundFrom: "2026-12-03", returnDate: "2026-12-08" }),
    [],
    TODAY,
    fetchImpl,
    undefined,
    NOW,
  );
  assert.equal(outcome.status, "saved");
  if (outcome.status !== "saved") return;
  assert.equal(outcome.log.amount, 352.71);
  assert.equal(outcome.log.returnDepart, "14:30");
  assert.equal(outcome.log.returnArrive, "18:20");
  assert.equal(outcome.log.autoFlights, "FR2589 2026-12-03; FR2590 2026-12-08");
  assert.match(urls[1], /outboundDepartureDateFrom=2026-12-08&outboundDepartureDateTo=2026-12-08/);
});

test("a range starting in the past is searched from today, a finished one is skipped", async () => {
  const { fetchImpl, urls } = mockFetch({ KRK: { fares: [fare("2026-10-29", 120)] } });
  await refreshRyanairPrice(route({ outboundFrom: "2026-10-20", outboundTo: "2026-11-05" }), [], TODAY, fetchImpl);
  assert.match(urls[0], /outboundDepartureDateFrom=2026-10-27/);

  const past = await refreshRyanairPrice(route({ outboundFrom: "2026-10-01", outboundTo: "2026-10-10" }), [], TODAY, fetchImpl);
  assert.deepEqual(past, { status: "past" });
});

test("no fare on sale, a Wizz-only route and a missing return fare save nothing", async () => {
  const empty = mockFetch({});
  assert.deepEqual(await refreshRyanairPrice(route(), [], TODAY, empty.fetchImpl), {
    status: "no-fare",
    leg: "outbound",
    from: "2026-12-01",
    to: "2026-12-31",
  });

  const withoutReturn = mockFetch({ KRK: { fares: [fare("2026-12-03", 202.41)] } });
  assert.deepEqual(
    await refreshRyanairPrice(route({ outboundTo: null, outboundFrom: "2026-12-03", returnDate: "2027-01-05" }), [], TODAY, withoutReturn.fetchImpl),
    { status: "no-fare", leg: "return", from: "2027-01-05", to: "2027-01-05" },
  );

  const wizzOnly = mockFetch({});
  assert.deepEqual(await refreshRyanairPrice(route({ destinationIata: "TLV" }), [], TODAY, wizzOnly.fetchImpl), {
    status: "not-served",
  });
  assert.equal(wizzOnly.urls.length, 0);
});

test("the same price for the same flights on the same day is not saved twice", async () => {
  const { fetchImpl } = mockFetch({ KRK: { fares: [fare("2026-12-03", 202.41, "FR2589")] } });
  const existing: PriceLog = {
    id: "l1",
    routeId: "r1",
    airline: "ryanair",
    amount: 202.41,
    currency: "PLN",
    checkedOn: TODAY,
    createdAt: "2026-10-27T08:00:00.000Z",
    outboundDepart: "10:05",
    outboundArrive: "13:55",
    returnDepart: null,
    returnArrive: null,
    autoFlights: "FR2589 2026-12-03",
  };
  assert.deepEqual(await refreshRyanairPrice(route(), [existing], TODAY, fetchImpl), {
    status: "unchanged",
    amount: 202.41,
  });
});

test("auto flights read as flight number and date per leg", () => {
  assert.equal(formatAutoFlights("FR2589 2026-12-03"), "FR2589, 3 gru 2026");
  assert.equal(formatAutoFlights(null), null);
});

test("the missing leg names the day and the direction", () => {
  assert.equal(
    noFareText("MXP", { leg: "outbound", from: "2026-11-05", to: "2026-11-05" }),
    "Ryanair nie sprzedaje lotu KRK → MXP 5 lis 2026.",
  );
  assert.equal(
    noFareText("MXP", { leg: "return", from: "2026-11-06", to: "2026-11-06" }),
    "Ryanair nie sprzedaje powrotu MXP → KRK 6 lis 2026.",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FLIGHT_DAY_SPAN,
  checkRouteFlights,
  datesToCheck,
  parseRyanairDay,
  parseWizzDates,
  ryanairDayUrl,
  wizzDatesUrl,
} from "./flight-day";

test("a single outbound day stays one day, a range is inclusive and capped", () => {
  assert.deepEqual(datesToCheck("2026-11-03", null), { dates: ["2026-11-03"], truncated: false });
  assert.deepEqual(datesToCheck("2026-11-03", "2026-11-03"), { dates: ["2026-11-03"], truncated: false });
  assert.deepEqual(datesToCheck("2026-11-02", "2026-11-04"), {
    dates: ["2026-11-02", "2026-11-03", "2026-11-04"],
    truncated: false,
  });

  const long = datesToCheck("2026-11-01", "2026-12-15");
  assert.equal(long.dates.length, MAX_FLIGHT_DAY_SPAN);
  assert.equal(long.dates[0], "2026-11-01");
  assert.equal(long.dates.at(-1), "2026-11-14");
  assert.equal(long.truncated, true);
  assert.deepEqual(datesToCheck("not-a-date", null), { dates: [], truncated: false });
});

test("ryanair day parser keeps the flight on that date and drops the fare", () => {
  const operated = parseRyanairDay(
    {
      fares: [
        {
          outbound: {
            departureDate: "2026-11-03T06:20:00",
            flightNumber: "FR3505",
            price: { value: 65.97, currencyCode: "PLN" },
          },
        },
        { outbound: { departureDate: "2026-11-04T06:00:00", flightNumber: "FR889", price: { value: 10 } } },
      ],
    },
    "2026-11-03",
  );
  assert.deepEqual(operated, { status: "operated", flights: [{ number: "FR3505", departs: "06:20" }] });
  assert.deepEqual(parseRyanairDay({ fares: [] }, "2026-11-03"), { status: "absent", flights: [] });
  assert.equal(parseRyanairDay({ fares: "nope" }, "2026-11-03"), null);
});

test("wizz date parser keeps the calendar day", () => {
  assert.deepEqual(parseWizzDates({ flightDates: ["2026-11-01T00:00:00", "2026-11-02T00:00:00"] }), [
    "2026-11-01",
    "2026-11-02",
  ]);
  assert.deepEqual(parseWizzDates({ flightDates: [] }), []);
  assert.equal(parseWizzDates({}), null);
});

test("day urls stay on the airline schedule endpoints", () => {
  const ryanair = new URL(ryanairDayUrl("krk", "snn", "2026-11-03") ?? "");
  assert.equal(ryanair.origin, "https://www.ryanair.com");
  assert.equal(ryanair.searchParams.get("departureAirportIataCode"), "KRK");
  assert.equal(ryanair.searchParams.get("arrivalAirportIataCode"), "SNN");
  assert.equal(ryanair.searchParams.get("outboundDepartureDateFrom"), "2026-11-03");
  assert.equal(ryanair.searchParams.get("outboundDepartureDateTo"), "2026-11-03");

  const wizz = new URL(wizzDatesUrl("KRK", "LTN", "2026-11-01", "2026-11-03") ?? "");
  assert.equal(wizz.origin, "https://be.wizzair.com");
  assert.equal(wizz.searchParams.get("departureStation"), "KRK");
  assert.equal(wizz.searchParams.get("arrivalStation"), "LTN");
  assert.equal(ryanairDayUrl("KRAKOW", "SNN", "2026-11-03"), null);
});

test("check reports a sold ryanair day, a wizz gap, and a blocked wizz read", async () => {
  const trip = {
    destinationIata: "ltn",
    outboundFrom: "2026-11-03",
    outboundTo: null,
    returnDate: "2026-11-10",
  };

  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "www.ryanair.com") {
      const date = url.searchParams.get("outboundDepartureDateFrom");
      const fares =
        date === "2026-11-03"
          ? [{ outbound: { departureDate: "2026-11-03T21:15:00", flightNumber: "FR123", price: { value: 99 } } }]
          : [];
      return new Response(JSON.stringify({ fares }), { status: 200 });
    }
    if (url.searchParams.get("departureStation") === "KRK") {
      return new Response(JSON.stringify({ flightDates: ["2026-11-01T00:00:00", "2026-11-02T00:00:00"] }), {
        status: 200,
      });
    }
    throw new TypeError("Failed to fetch");
  };

  const reports = await checkRouteFlights(trip, ["ryanair", "wizzair"], fetchImpl);
  assert.equal(reports.length, 4);

  const ryanairOut = reports.find((report) => report.airline === "ryanair" && report.direction === "outbound");
  assert.equal(ryanairOut?.failure, null);
  assert.equal(ryanairOut?.days[0]?.status, "operated");
  assert.equal(ryanairOut?.days[0]?.flights[0]?.number, "FR123");

  const ryanairBack = reports.find((report) => report.airline === "ryanair" && report.direction === "return");
  assert.equal(ryanairBack?.origin, "LTN");
  assert.equal(ryanairBack?.destination, "KRK");
  assert.equal(ryanairBack?.days[0]?.status, "absent");

  const wizzOut = reports.find((report) => report.airline === "wizzair" && report.direction === "outbound");
  assert.equal(wizzOut?.days[0]?.status, "absent");

  const wizzBack = reports.find((report) => report.airline === "wizzair" && report.direction === "return");
  assert.equal(wizzBack?.failure, "blocked");
  assert.equal(wizzBack?.days[0]?.status, "unavailable");
});

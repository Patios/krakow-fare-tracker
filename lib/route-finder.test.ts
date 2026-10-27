import assert from "node:assert/strict";
import test from "node:test";
import { destinations } from "./airports";
import { foundRouteLog, parseFinder, ryanairFinderUrl, wizzOnlyDestinations } from "./route-finder";

function leg(from: string, to: string, at: string, value: number, number = "FR1") {
  return {
    departureAirport: { iataCode: from },
    arrivalAirport: { iataCode: to },
    departureDate: at,
    arrivalDate: at.replace(/T\d{2}/, "T23"),
    flightNumber: number,
    price: { value, currencyCode: "PLN" },
  };
}

test("one-way and return searches use the matching Ryanair endpoint and dates", () => {
  const oneWay = ryanairFinderUrl({ outboundFrom: "2026-12-03", outboundTo: "2026-12-05", returnDate: null }) ?? "";
  assert.match(oneWay, /oneWayFares\?departureAirportIataCode=KRK&outboundDepartureDateFrom=2026-12-03&outboundDepartureDateTo=2026-12-05/);
  const roundTrip = ryanairFinderUrl({ outboundFrom: "2026-12-03", outboundTo: null, returnDate: "2026-12-08" }) ?? "";
  assert.match(roundTrip, /roundTripFares\?.*outboundDepartureDateTo=2026-12-03&inboundDepartureDateFrom=2026-12-08&inboundDepartureDateTo=2026-12-08/);
  assert.equal(ryanairFinderUrl({ outboundFrom: "2026-12-08", outboundTo: null, returnDate: "2026-12-03" }), null);
});

test("results keep listed destinations, cheapest first, and count the rest", () => {
  const trip = { outboundFrom: "2026-12-03", outboundTo: "2026-12-05", returnDate: null };
  const parsed = parseFinder(
    {
      fares: [
        { outbound: leg("KRK", "AGP", "2026-12-03T10:05:00", 202.41, "FR2589") },
        { outbound: leg("KRK", "SOF", "2026-12-05T07:00:00", 65, "FR8975") },
        { outbound: leg("KRK", "XXX", "2026-12-04T07:00:00", 10) },
        { outbound: leg("KRK", "BLQ", "2026-12-09T07:00:00", 20) },
      ],
    },
    trip,
  );
  assert.ok(parsed);
  assert.deepEqual(
    parsed.routes.map((route) => [route.destination.iata, route.amount]),
    [
      ["SOF", 65],
      ["AGP", 202.41],
    ],
  );
  assert.equal(parsed.unlisted, 1);
  assert.equal(parsed.routes[1].outbound.number, "FR2589");
  assert.equal(parsed.routes[1].outbound.departs, "10:05");
});

test("a return search sums both legs and drops pairs on another return day", () => {
  const trip = { outboundFrom: "2026-12-03", outboundTo: null, returnDate: "2026-12-08" };
  const parsed = parseFinder(
    {
      fares: [
        { outbound: leg("KRK", "VCE", "2026-12-03T06:50:00", 74), inbound: leg("VCE", "KRK", "2026-12-08T14:15:00", 98.39) },
        { outbound: leg("KRK", "AGP", "2026-12-03T10:05:00", 50), inbound: leg("AGP", "KRK", "2026-12-09T14:15:00", 50) },
      ],
    },
    trip,
  );
  assert.deepEqual(parsed?.routes.map((route) => [route.destination.iata, route.amount]), [["VCE", 172.39]]);
  const log = foundRouteLog(parsed!.routes[0], "r1", "2026-10-27", new Date("2026-10-27T09:00:00Z"));
  assert.equal(log.amount, 172.39);
  assert.equal(log.returnDepart, "14:15");
  assert.equal(log.autoFlights, "FR1 2026-12-03; FR1 2026-12-08");
});

test("wizz-only destinations exclude airports Ryanair also flies to", () => {
  const wizz = wizzOnlyDestinations(destinations).map((destination) => destination.iata);
  assert.ok(wizz.includes("TLV"));
  assert.ok(!wizz.includes("AGP"));
});

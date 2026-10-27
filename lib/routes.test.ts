import assert from "node:assert/strict";
import test from "node:test";
import { AIRLINE_LABEL, RYANAIR_IATA, WIZZ_IATA, airlinesFor, destinationByIata, destinations } from "./airports";
import { formatFlightTimes, parseAmount, parseTimeInput } from "./format";
import { lowestLoggedPrice, matchesRouteFilter, orderedLogs, priceDrop, sortRoutes } from "./routes";
import { ryanairSearchUrl, wizzairSearchUrl } from "./search-urls";
import { parseStore } from "./storage";
import type { Airline, PriceLog, WatchedRoute } from "./types";

const EXPECTED_RYANAIR =
  "ABZ AGA ALC BCN BRI BFS BHX BLQ BOH BRS CRL BUD BBU CAG DUB DBV EMA EDI EIN FAO FUE GDN GLA GOT LPA CTA CPH SUF LBA LIS LPL LTN STN MAD AGP MLA MAN RAK MRS BGY MXP FMM NAP NCL TRF PFO PMO BVA PSR PSA OPO PRG RBA RIX CIA SKG SVQ SNN SOF ARN TFS TIA TRS TLS VLC VCE VIE";

const EXPECTED_WIZZ =
  "BCN BSL BGO BIO BUD BBU EIN LCA LGW LYS AGP RMF MXP NCE OSL FCO SVG TLL TLV VLC VCE VRN VNO";

test("seed matches the 20 Oct 2026 Kraków winter guide", () => {
  assert.deepEqual([...RYANAIR_IATA], EXPECTED_RYANAIR.split(" "));
  assert.deepEqual([...WIZZ_IATA], EXPECTED_WIZZ.split(" "));
  assert.equal(RYANAIR_IATA.length, 67);
  assert.equal(WIZZ_IATA.length, 23);
});

test("shared airports and the split city pairs stay separate", () => {
  const shared = RYANAIR_IATA.filter((code) => new Set<string>(WIZZ_IATA).has(code)).sort();
  assert.deepEqual(shared, ["AGP", "BBU", "BCN", "BUD", "EIN", "MXP", "VCE", "VLC"]);

  assert.deepEqual(airlinesFor("LTN"), ["ryanair"]);
  assert.deepEqual(airlinesFor("STN"), ["ryanair"]);
  assert.deepEqual(airlinesFor("LGW"), ["wizzair"]);
  assert.deepEqual(airlinesFor("BGY"), ["ryanair"]);
  assert.deepEqual(airlinesFor("MXP"), ["ryanair", "wizzair"]);
  assert.deepEqual(airlinesFor("TRF"), ["ryanair"]);
  assert.deepEqual(airlinesFor("OSL"), ["wizzair"]);
  assert.deepEqual(airlinesFor("CIA"), ["ryanair"]);
  assert.deepEqual(airlinesFor("FCO"), ["wizzair"]);
  assert.deepEqual(airlinesFor("VCE"), ["ryanair", "wizzair"]);
  assert.deepEqual(airlinesFor("BBU"), ["ryanair", "wizzair"]);
  assert.deepEqual(airlinesFor("FMM"), ["ryanair"]);

  for (const code of ["TSF", "OTP", "MUC"]) {
    assert.equal(destinationByIata.has(code), false);
  }

  assert.equal(destinationByIata.get("VCE")?.airport, "Marco Polo");
  assert.equal(destinationByIata.get("BBU")?.airport, "Aurel Vlaicu");
  assert.equal(destinationByIata.get("FMM")?.city, "Memmingen");
  assert.equal(destinations.length, 82);
  assert.equal(new Set(destinations.map((item) => item.iata)).size, 82);
});

test("every seeded airport has a name and at least one airline", () => {
  for (const destination of destinations) {
    assert.ok(destination.city.length > 0);
    assert.ok(destination.airport.length > 0);
    assert.ok(destination.country.length > 0);
    assert.ok(destination.airlines.length > 0);
    assert.deepEqual(destination.airlines, airlinesFor(destination.iata));
  }
  assert.equal(AIRLINE_LABEL.ryanair, "Ryanair");
  assert.equal(AIRLINE_LABEL.wizzair, "Wizz Air");
});

test("search urls carry KRK, the destination and the dates", () => {
  const ranged = {
    outboundFrom: "2026-12-01",
    outboundTo: "2026-12-08",
    returnDate: "2026-12-15",
  };
  const ryanair = new URL(ryanairSearchUrl(ranged, "STN"));
  assert.equal(ryanair.origin, "https://www.ryanair.com");
  assert.equal(ryanair.pathname, "/pl/pl/trip/flights/select");
  assert.equal(ryanair.searchParams.get("originIata"), "KRK");
  assert.equal(ryanair.searchParams.get("destinationIata"), "STN");
  assert.equal(ryanair.searchParams.get("tpOriginIata"), "KRK");
  assert.equal(ryanair.searchParams.get("tpDestinationIata"), "STN");
  assert.equal(ryanair.searchParams.get("dateOut"), "2026-12-01");
  assert.equal(ryanair.searchParams.get("dateIn"), "2026-12-15");
  assert.equal(ryanair.searchParams.get("isReturn"), "true");
  assert.equal(ryanair.searchParams.get("tpStartDate"), "2026-12-01");
  assert.equal(ryanair.searchParams.get("tpEndDate"), "2026-12-08");
  assert.equal(ryanair.searchParams.get("adults"), "1");

  const oneWay = new URL(
    ryanairSearchUrl({ outboundFrom: "2026-11-02", outboundTo: null, returnDate: null }, "BGY"),
  );
  assert.equal(oneWay.searchParams.get("dateIn"), "");
  assert.equal(oneWay.searchParams.get("isReturn"), "false");
  assert.equal(oneWay.searchParams.get("tpEndDate"), "");
  assert.equal(oneWay.searchParams.get("destinationIata"), "BGY");

  const wizz = new URL(wizzairSearchUrl(ranged, "LGW"));
  assert.equal(
    wizz.pathname,
    "/pl-pl/booking/select-flight/KRK/LGW/2026-12-01/2026-12-15/1/0/0/null",
  );
  const wizzOneWay = new URL(
    wizzairSearchUrl({ outboundFrom: "2026-12-01", outboundTo: "2026-12-08", returnDate: null }, "FCO"),
  );
  assert.equal(wizzOneWay.pathname, "/pl-pl/booking/select-flight/KRK/FCO/2026-12-01/null/1/0/0/null");
});

function route(partial: Partial<WatchedRoute> & Pick<WatchedRoute, "id" | "destinationIata">): WatchedRoute {
  return {
    outboundFrom: "2026-12-01",
    outboundTo: null,
    returnDate: null,
    createdAt: "2026-10-27T10:00:00.000Z",
    ...partial,
  };
}

function log(partial: Partial<PriceLog> & Pick<PriceLog, "id" | "routeId" | "amount" | "checkedOn">): PriceLog {
  return {
    airline: "ryanair",
    currency: "PLN",
    createdAt: `${partial.checkedOn}T12:00:00.000Z`,
    outboundDepart: null,
    outboundArrive: null,
    returnDepart: null,
    returnArrive: null,
    ...partial,
  };
}

test("the saved-route filter matches city, country, airline and a price drop", () => {
  const routes = [
    route({ id: "blq", destinationIata: "BLQ" }),
    route({ id: "lgw", destinationIata: "LGW" }),
    route({ id: "bcn", destinationIata: "BCN" }),
  ];
  const logs = [
    log({ id: "old", routeId: "blq", amount: 200, checkedOn: "2026-10-20" }),
    log({ id: "new", routeId: "blq", amount: 150, checkedOn: "2026-10-27" }),
    log({ id: "lgw", routeId: "lgw", amount: 90, checkedOn: "2026-10-27" }),
  ];
  const all = { query: "", airlines: ["ryanair", "wizzair"] satisfies Airline[], dropsOnly: false };

  assert.equal(matchesRouteFilter(routes[0], logs, { ...all, query: "wlochy" }), true);
  assert.equal(matchesRouteFilter(routes[0], logs, { ...all, query: "blq" }), true);
  assert.equal(matchesRouteFilter(routes[1], logs, { ...all, query: "bolonia" }), false);
  assert.equal(matchesRouteFilter(routes[1], logs, { ...all, airlines: ["ryanair"] }), false);
  assert.equal(matchesRouteFilter(routes[2], logs, { ...all, airlines: ["wizzair"] }), true);
  assert.equal(matchesRouteFilter(routes[0], logs, { ...all, airlines: [] }), false);
  assert.equal(matchesRouteFilter(routes[0], logs, { ...all, dropsOnly: true }), true);
  assert.equal(matchesRouteFilter(routes[1], logs, { ...all, dropsOnly: true }), false);
});

test("routes sort by the lowest logged price and flag a drop against the previous log", () => {
  const routes = [
    route({ id: "empty", destinationIata: "VCE" }),
    route({ id: "dear", destinationIata: "STN" }),
    route({ id: "cheap", destinationIata: "BGY" }),
  ];
  const logs = [
    log({ id: "a", routeId: "dear", amount: 300, checkedOn: "2026-10-20" }),
    log({ id: "b", routeId: "cheap", amount: 180, checkedOn: "2026-10-20", airline: "wizzair" }),
    log({ id: "c", routeId: "cheap", amount: 140, checkedOn: "2026-10-26", airline: "ryanair" }),
  ];

  assert.deepEqual(
    sortRoutes(routes, logs).map((item) => item.id),
    ["cheap", "dear", "empty"],
  );
  assert.deepEqual(
    sortRoutes(
      [
        route({ id: "empty", destinationIata: "VCE", createdAt: "2026-10-27T12:00:00.000Z" }),
        route({ id: "dear", destinationIata: "STN" }),
        route({ id: "cheap", destinationIata: "BGY" }),
      ],
      logs,
    ).map((item) => item.id),
    ["empty", "cheap", "dear"],
  );

  const cheapLogs = orderedLogs(logs, "cheap");
  assert.equal(cheapLogs[0]?.id, "c");
  assert.equal(lowestLoggedPrice(cheapLogs), 140);
  const drop = priceDrop(cheapLogs);
  assert.equal(drop?.delta, 40);
  assert.equal(drop?.latest.airline, "ryanair");
  assert.equal(drop?.previous.airline, "wizzair");
  assert.equal(priceDrop(orderedLogs(logs, "dear")), null);
  assert.equal(priceDrop(orderedLogs(logs, "empty")), null);
});

test("a higher latest price is not marked as a drop", () => {
  const logs = [
    log({ id: "old", routeId: "r", amount: 100, checkedOn: "2026-10-01" }),
    log({ id: "new", routeId: "r", amount: 130, checkedOn: "2026-10-20" }),
  ];
  assert.equal(priceDrop(orderedLogs(logs, "r")), null);
});

test("amount parsing accepts Polish zloty input", () => {
  assert.equal(parseAmount("149,50"), 149.5);
  assert.equal(parseAmount("1 299"), 1299);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseAmount("12,345"), null);
});

test("flight times are optional and stay with the logged price", () => {
  assert.equal(parseTimeInput(""), null);
  assert.equal(parseTimeInput("06:40"), "06:40");
  assert.equal(parseTimeInput("06:40:00"), "06:40");
  assert.equal(parseTimeInput("24:00"), "invalid");
  assert.equal(parseTimeInput("6:40"), "invalid");

  const timed = log({
    id: "timed",
    routeId: "r",
    amount: 99,
    checkedOn: "2026-10-27",
    outboundDepart: "06:40",
    outboundArrive: "09:15",
    returnDepart: "18:20",
    returnArrive: "20:55",
  });
  assert.equal(formatFlightTimes(timed), "wylot 06:40–09:15 · powrót 18:20–20:55");
  assert.equal(formatFlightTimes(log({ id: "plain", routeId: "r", amount: 10, checkedOn: "2026-10-27" })), null);

  const raw = JSON.stringify({
    routes: [],
    logs: [
      {
        id: "old",
        routeId: "r",
        airline: "ryanair",
        amount: 80,
        currency: "PLN",
        checkedOn: "2026-10-20",
        createdAt: "2026-10-20T12:00:00.000Z",
      },
    ],
  });
  const stored = parseStore(raw);
  assert.equal(stored.logs[0]?.outboundDepart, null);
  assert.equal(stored.logs[0]?.returnArrive, null);

  const withTimes = parseStore(
    JSON.stringify({
      routes: [],
      logs: [{ ...stored.logs[0], outboundDepart: "07:05", returnArrive: "21:10" }],
    }),
  );
  assert.equal(withTimes.logs[0]?.outboundDepart, "07:05");
  assert.equal(withTimes.logs[0]?.returnArrive, "21:10");
  assert.throws(() =>
    parseStore(JSON.stringify({ routes: [], logs: [{ ...stored.logs[0], outboundDepart: "7:05" }] })),
  );
});

test("corrupt storage is rejected", () => {
  assert.deepEqual(parseStore(""), { routes: [], logs: [] });
  assert.throws(() => parseStore("{"));
  assert.throws(() => parseStore(JSON.stringify({ routes: [{}], logs: [] })));
});

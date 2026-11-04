import assert from "node:assert/strict";
import test from "node:test";
import { bestDeals } from "./deals";
import type { PriceLog, WatchedRoute } from "./types";
import type { WizzData } from "./wizz-data";

function route(partial: Partial<WatchedRoute> & Pick<WatchedRoute, "id" | "destinationIata">): WatchedRoute {
  return {
    outboundFrom: "2026-11-10",
    outboundTo: null,
    returnDate: null,
    createdAt: "2026-10-20T10:00:00.000Z",
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

test("recommends a fresh historical low in the next 31 days", () => {
  const routes = [route({ id: "blq", destinationIata: "BLQ" })];
  const logs = [
    log({ id: "old", routeId: "blq", amount: 240, checkedOn: "2026-10-30" }),
    log({ id: "new", routeId: "blq", amount: 150, checkedOn: "2026-11-04" }),
  ];

  const [deal] = bestDeals(routes, logs, "2026-11-04");
  assert.equal(deal?.verdict, "book");
  assert.equal(deal?.latest.id, "new");
  assert.equal(deal?.fresh, true);
  assert.equal(deal?.historicalLow, 150);
});

test("does not recommend a high price, a single reading, or a trip outside the period", () => {
  const routes = [
    route({ id: "high", destinationIata: "BLQ" }),
    route({ id: "one", destinationIata: "VCE" }),
    route({ id: "later", destinationIata: "AGP", outboundFrom: "2026-12-05" }),
  ];
  const logs = [
    log({ id: "high-old", routeId: "high", amount: 100, checkedOn: "2026-11-01" }),
    log({ id: "high-new", routeId: "high", amount: 180, checkedOn: "2026-11-04" }),
    log({ id: "one", routeId: "one", amount: 90, checkedOn: "2026-11-04" }),
    log({ id: "later-old", routeId: "later", amount: 180, checkedOn: "2026-11-01" }),
    log({ id: "later-new", routeId: "later", amount: 90, checkedOn: "2026-11-04" }),
  ];

  assert.deepEqual(bestDeals(routes, logs, "2026-11-04"), []);
});

test("compares airlines separately and ranks a stronger discount first", () => {
  const routes = [route({ id: "mxp", destinationIata: "MXP" }), route({ id: "bud", destinationIata: "BUD" })];
  const logs = [
    log({ id: "r-old", routeId: "mxp", airline: "ryanair", amount: 200, checkedOn: "2026-10-30" }),
    log({ id: "r-new", routeId: "mxp", airline: "ryanair", amount: 140, checkedOn: "2026-11-04" }),
    log({ id: "w-old", routeId: "mxp", airline: "wizzair", amount: 100, checkedOn: "2026-10-30" }),
    log({ id: "w-new", routeId: "mxp", airline: "wizzair", amount: 80, checkedOn: "2026-11-04" }),
    log({ id: "b-old", routeId: "bud", amount: 210, checkedOn: "2026-10-30" }),
    log({ id: "b-new", routeId: "bud", amount: 150, checkedOn: "2026-11-04" }),
  ];

  assert.deepEqual(
    bestDeals(routes, logs, "2026-11-04").map((deal) => `${deal.route.id}-${deal.airline}`),
    ["mxp-ryanair", "bud-ryanair", "mxp-wizzair"],
  );
});

test("includes a confirmed current Wizz fare without saving it to price history", () => {
  const routes = [route({ id: "vno", destinationIata: "VNO" })];
  const wizz: WizzData = {
    checkedAt: "2026-11-04T08:30:00.000Z",
    apiVersion: "test",
    through: "2026-12-31",
    destinations: [],
    fares: { VNO: { out: [["2026-11-10", 95, ["06:15"]]], back: [] } },
  };

  const [deal] = bestDeals(routes, [], "2026-11-04", { wizz });
  assert.equal(deal?.source, "wizz-file");
  assert.equal(deal?.verdict, "current");
  assert.equal(deal?.latest.amount, 95);
  assert.equal(deal?.latest.outboundDepart, "06:15");
  assert.equal(deal?.pricedOutbound, "2026-11-10");
});

test("a small drop and a Wizz fare above its history are not deals", () => {
  const routes = [route({ id: "tiny", destinationIata: "BLQ" }), route({ id: "vno", destinationIata: "VNO" })];
  const logs = [
    log({ id: "tiny-old", routeId: "tiny", amount: 100, checkedOn: "2026-10-30" }),
    log({ id: "tiny-new", routeId: "tiny", amount: 95, checkedOn: "2026-11-04" }),
    log({ id: "vno-old", routeId: "vno", airline: "wizzair", amount: 80, checkedOn: "2026-10-30" }),
    log({ id: "vno-new", routeId: "vno", airline: "wizzair", amount: 70, checkedOn: "2026-11-02" }),
  ];
  const wizz: WizzData = {
    checkedAt: "2026-11-04T08:30:00.000Z",
    apiVersion: "test",
    through: "2026-12-31",
    destinations: [],
    fares: { VNO: { out: [["2026-11-10", 120, ["06:15"]]], back: [] } },
  };

  assert.deepEqual(bestDeals(routes, logs, "2026-11-04", { wizz }), []);
});

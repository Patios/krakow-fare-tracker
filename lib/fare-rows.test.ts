import assert from "node:assert/strict";
import test from "node:test";
import { cloudChanges, mergeStores, priceFromRow, routeFromRow, storeFromRows } from "./fare-rows";
import type { PriceLog, WatchedRoute } from "./types";

const route: WatchedRoute = {
  id: "11111111-1111-4111-8111-111111111111",
  destinationIata: "BGY",
  outboundFrom: "2026-11-23",
  outboundTo: null,
  returnDate: null,
  createdAt: "2026-10-27T10:00:00.000Z",
};

const log: PriceLog = {
  id: "22222222-2222-4222-8222-222222222222",
  routeId: route.id,
  airline: "ryanair",
  amount: 210,
  currency: "PLN",
  checkedOn: "2026-10-27",
  createdAt: "2026-10-27T11:00:00.000Z",
  outboundDepart: "06:40",
  outboundArrive: "08:35",
  returnDepart: null,
  returnArrive: null,
};

test("database rows become routes and prices", () => {
  const stored = storeFromRows(
    [
      {
        id: route.id,
        destination_iata: "BGY",
        outbound_from: "2026-11-23",
        outbound_to: null,
        return_date: null,
        created_at: route.createdAt,
      },
    ],
    [
      {
        id: log.id,
        route_id: route.id,
        airline: "ryanair",
        amount: "210.00",
        currency: "PLN",
        checked_on: "2026-10-27",
        outbound_depart: "06:40:00",
        outbound_arrive: "08:35:00",
        return_depart: null,
        return_arrive: null,
        created_at: log.createdAt,
      },
    ],
  );
  assert.deepEqual(stored, { routes: [route], logs: [log] });
  assert.equal(routeFromRow({ id: "x" }), null);
  assert.equal(priceFromRow({ id: log.id, amount: "0" }), null);
});

test("the first sign-in uploads local rows the account does not have", () => {
  const remoteRoute = { ...route, id: "33333333-3333-4333-8333-333333333333", destinationIata: "BCN" };
  const { merged, extraRoutes, extraLogs } = mergeStores(
    { routes: [remoteRoute], logs: [] },
    { routes: [remoteRoute, route], logs: [log] },
  );
  assert.deepEqual(extraRoutes, [route]);
  assert.deepEqual(extraLogs, [log]);
  assert.deepEqual(merged.routes.map((item) => item.id), [remoteRoute.id, route.id]);
  assert.equal(merged.logs.length, 1);
});

test("a route deletion does not also delete its prices one by one", () => {
  const changes = cloudChanges({ routes: [route], logs: [log] }, { routes: [], logs: [] });
  assert.deepEqual(changes.removedRouteIds, [route.id]);
  assert.deepEqual(changes.removedLogIds, []);
  assert.deepEqual(changes.addedRoutes, []);
});

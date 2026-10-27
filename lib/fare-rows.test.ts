import assert from "node:assert/strict";
import test from "node:test";
import { cloudChanges, mergeStores, priceFromRow, routeFromRow, routeToRow, storeFromRows } from "./fare-rows";
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
  assert.deepEqual(changes.updatedRoutes, []);
});

test("an edited route is updated in place and an unchanged route is not", () => {
  const edited = {
    ...route,
    outboundFrom: "2026-11-24",
    outboundDepart: "08:00",
    outboundArrive: "10:00",
    returnDepart: null,
    returnArrive: null,
  };
  const changed = cloudChanges({ routes: [route], logs: [log] }, { routes: [edited], logs: [log] });
  assert.deepEqual(changed.addedRoutes, []);
  assert.deepEqual(changed.removedRouteIds, []);
  assert.deepEqual(changed.updatedRoutes, [edited]);

  const sameTimes = { ...route, outboundDepart: null, outboundArrive: null, returnDepart: null, returnArrive: null };
  const unchanged = cloudChanges({ routes: [route], logs: [] }, { routes: [sameTimes], logs: [] });
  assert.deepEqual(unchanged.updatedRoutes, []);

  const remoteWithHours = { ...sameTimes, outboundDepart: "08:00", outboundArrive: "10:00" };
  const localWithoutHours = cloudChanges({ routes: [remoteWithHours], logs: [] }, { routes: [route], logs: [] });
  assert.deepEqual(localWithoutHours.updatedRoutes, []);
});

test("route hours round-trip only when the columns are present", () => {
  assert.equal("outbound_depart" in routeToRow(route), false);
  const row = routeToRow({
    ...route,
    outboundDepart: "06:40",
    outboundArrive: null,
    returnDepart: null,
    returnArrive: null,
  });
  assert.equal(row.outbound_depart, "06:40");
  const stored = routeFromRow({
    id: route.id,
    destination_iata: "BGY",
    outbound_from: "2026-11-23",
    outbound_to: null,
    return_date: null,
    created_at: route.createdAt,
    outbound_depart: "06:40:00",
    outbound_arrive: null,
    return_depart: null,
    return_arrive: null,
  });
  assert.equal(stored?.outboundDepart, "06:40");
  assert.equal(stored?.outboundArrive, null);
});

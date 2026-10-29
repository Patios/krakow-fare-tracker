import assert from "node:assert/strict";
import test from "node:test";
import { currentDayFlights, currentNoFare, DEFAULT_INTERVAL_HOURS, dueRouteIds, nextCheckAt, parseAutoRefresh, tripKey } from "./auto-refresh";
import { routeFromRow, routeToRow } from "./fare-rows";
import type { WatchedRoute } from "./types";

const NOW = new Date("2026-10-27T18:00:00.000Z");
const TODAY = "2026-10-27";

function route(id: string, overrides: Partial<WatchedRoute> = {}): WatchedRoute {
  return {
    id,
    destinationIata: "AGP",
    outboundFrom: "2026-12-03",
    outboundTo: null,
    returnDate: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    autoRefresh: true,
    ...overrides,
  };
}

test("only ticked Ryanair routes whose last check is older than the interval are due", () => {
  const settings = {
    intervalHours: 4,
    lastChecked: {
      fresh: "2026-10-27T15:00:00.000Z",
      stale: "2026-10-27T13:59:00.000Z",
    },
    noFare: {},
    dayFlights: {},
  };
  const due = dueRouteIds(
    [
      route("never"),
      route("fresh"),
      route("stale"),
      route("off", { autoRefresh: false }),
      route("wizz", { destinationIata: "TLV" }),
      route("past", { outboundFrom: "2026-10-01" }),
    ],
    settings,
    TODAY,
    NOW,
  );
  assert.deepEqual(due, ["never", "stale"]);
  assert.equal(nextCheckAt("fresh", settings)?.toISOString(), "2026-10-27T19:00:00.000Z");
});

test("unknown intervals and broken storage fall back to the default", () => {
  assert.equal(parseAutoRefresh(JSON.stringify({ intervalHours: 5 })).intervalHours, DEFAULT_INTERVAL_HOURS);
  assert.deepEqual(parseAutoRefresh("{broken"), {
    intervalHours: DEFAULT_INTERVAL_HOURS,
    lastChecked: {},
    noFare: {},
    dayFlights: {},
  });
  assert.deepEqual(parseAutoRefresh(JSON.stringify({ intervalHours: 8, lastChecked: { a: "nope", b: NOW.toISOString() } })), {
    intervalHours: 8,
    lastChecked: { b: NOW.toISOString() },
    noFare: {},
    dayFlights: {},
  });
});

test("a saved missing fare shows only while the route keeps the checked dates", () => {
  const mxp = route("mxp", { destinationIata: "MXP", outboundFrom: "2026-11-05", returnDate: "2026-11-06" });
  const settings = parseAutoRefresh(
    JSON.stringify({
      intervalHours: 4,
      lastChecked: {},
      noFare: { mxp: { leg: "outbound", from: "2026-11-05", to: "2026-11-05", trip: tripKey(mxp) } },
    }),
  );
  assert.deepEqual(currentNoFare(mxp, settings), {
    missing: [{ leg: "outbound", from: "2026-11-05", to: "2026-11-05" }],
    available: null,
  });
  assert.equal(currentNoFare({ ...mxp, outboundFrom: "2026-11-03" }, settings), null);
});

test("the day's flights stay with the route only for the checked dates", () => {
  const stn = route("stn", { destinationIata: "STN", outboundFrom: "2026-11-20" });
  const legs = [
    {
      leg: "outbound",
      date: "2026-11-20",
      flights: [{ amount: 113.72, date: "2026-11-20", number: "FR2498", departs: "11:35", arrives: "13:00" }, { broken: true }],
    },
  ];
  const settings = parseAutoRefresh(
    JSON.stringify({ intervalHours: 4, lastChecked: {}, dayFlights: { stn: { trip: tripKey(stn), legs } } }),
  );
  assert.deepEqual(currentDayFlights(stn, settings), [{ ...legs[0], flights: [legs[0].flights[0]] }]);
  assert.deepEqual(currentDayFlights({ ...stn, outboundFrom: "2026-11-21" }, settings), []);
});

test("the automatic flag round-trips through the account row", () => {
  const row = routeToRow(route("r1"));
  assert.equal(row.auto_refresh, true);
  assert.equal(routeFromRow(row)?.autoRefresh, true);
  const { autoRefresh: _flag, ...plain } = route("r2");
  assert.equal("auto_refresh" in routeToRow(plain), false);
});

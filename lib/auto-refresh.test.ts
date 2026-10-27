import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_INTERVAL_HOURS, dueRouteIds, nextCheckAt, parseAutoRefresh } from "./auto-refresh";
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
  assert.deepEqual(parseAutoRefresh("{broken"), { intervalHours: DEFAULT_INTERVAL_HOURS, lastChecked: {} });
  assert.deepEqual(parseAutoRefresh(JSON.stringify({ intervalHours: 8, lastChecked: { a: "nope", b: NOW.toISOString() } })), {
    intervalHours: 8,
    lastChecked: { b: NOW.toISOString() },
  });
});

test("the automatic flag round-trips through the account row", () => {
  const row = routeToRow(route("r1"));
  assert.equal(row.auto_refresh, true);
  assert.equal(routeFromRow(row)?.autoRefresh, true);
  const { autoRefresh: _flag, ...plain } = route("r2");
  assert.equal("auto_refresh" in routeToRow(plain), false);
});

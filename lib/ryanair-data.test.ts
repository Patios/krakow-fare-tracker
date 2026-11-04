import assert from "node:assert/strict";
import test from "node:test";
import { liveRyanairFare, parseRyanairData, ryanairCalendarDeals, type RyanairData } from "./ryanair-data";
import type { WatchedRoute } from "./types";

const data: RyanairData = {
  checkedAt: "2026-11-04T10:00:00.000Z",
  through: "2027-07-02",
  destinations: [{ iata: "MXP", city: "Mediolan", country: "Włochy" }],
  fares: {
    MXP: {
      out: [["2026-11-05", 119.99, "06:00", "07:45"]],
      back: [["2026-11-09", 139.99, null, null]],
      outCheckedAt: "2026-11-04T10:00:00.000Z",
      backCheckedAt: "2026-11-04T10:00:00.000Z",
    },
  },
};

test("the published Ryanair snapshot accepts only valid destinations and fare days", () => {
  assert.deepEqual(parseRyanairData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(parseRyanairData({ checkedAt: "now", through: "nope" }), null);
  assert.deepEqual(
    parseRyanairData({ ...data, fares: { MXP: { out: [["not-a-date", 10, null, null]], back: "nope" } } })?.fares.MXP,
    {
      out: [],
      back: [],
      outCheckedAt: "2026-11-04T10:00:00.000Z",
      backCheckedAt: "2026-11-04T10:00:00.000Z",
    },
  );
});

test("an explicit failed-leg timestamp is not replaced with the file timestamp", () => {
  const parsed = parseRyanairData({
    ...data,
    fares: { MXP: { ...data.fares.MXP, outCheckedAt: null } },
  });
  assert.equal(parsed?.fares.MXP.outCheckedAt, null);
});

test("a live fare combines the cheapest available outbound day and the fixed return day", () => {
  const route: WatchedRoute = {
    id: "mxp",
    destinationIata: "MXP",
    outboundFrom: "2026-11-04",
    outboundTo: "2026-11-06",
    returnDate: "2026-11-09",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const quote = liveRyanairFare(route, data, "2026-11-04");
  assert.equal(quote?.amount, 259.98);
  assert.equal(quote?.outboundDate, "2026-11-05");
  assert.equal(quote?.returnDate, "2026-11-09");
  assert.equal(liveRyanairFare({ ...route, returnDate: "2026-11-08" }, data, "2026-11-04"), null);
  assert.equal(liveRyanairFare({ ...route, outboundTo: "2027-07-03", returnDate: null }, data, "2026-11-04"), null);
});

test("the global calendar ranking needs no watched route and keeps one lowest fare per destination", () => {
  const ranked = ryanairCalendarDeals(
    {
      ...data,
      destinations: [...data.destinations, { iata: "BLQ", city: "Bolonia", country: "Włochy" }],
      fares: {
        ...data.fares,
        MXP: { ...data.fares.MXP, out: [["2026-11-05", 119.99, "06:00", "07:45"], ["2026-11-06", 89.99, "06:00", "07:45"]] },
        BLQ: { out: [["2026-11-05", 69.99, null, null]], back: [], outCheckedAt: "2026-11-04T10:00:00.000Z", backCheckedAt: null },
      },
    },
    "2026-11-04",
  );
  assert.deepEqual(ranked.map((deal) => [deal.destination.iata, deal.amount]), [["BLQ", 69.99], ["MXP", 89.99]]);
});

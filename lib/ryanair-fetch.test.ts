import assert from "node:assert/strict";
import test from "node:test";
import { mergeLegMonth, shouldRetry } from "../scripts/fetch-ryanair";

test("a failed calendar month keeps only that leg's earlier days", () => {
  const days: [string, number, string | null, string | null][] = [];
  const previous: [string, number, string | null, string | null][] = [
    ["2026-11-10", 99, "06:15", "08:00"],
    ["2026-12-02", 129, "09:00", "10:45"],
  ];
  assert.equal(mergeLegMonth(days, null, previous, "2026-11-01", "2026-11-04", "2026-12-04"), true);
  assert.deepEqual(days, [["2026-11-10", 99, "06:15", "08:00"]]);
});

test("only rate limits and server errors are retried", () => {
  assert.equal(shouldRetry(400), false);
  assert.equal(shouldRetry(404), false);
  assert.equal(shouldRetry(429), true);
  assert.equal(shouldRetry(500), true);
});

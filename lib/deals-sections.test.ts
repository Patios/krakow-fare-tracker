import assert from "node:assert/strict";
import test from "node:test";
import { parseDealSections } from "./deals-sections";

test("a missing or broken section preference stays expanded", () => {
  assert.deepEqual(parseDealSections(null), { ryanair: true, wizzair: true, watched: true });
  assert.deepEqual(parseDealSections("nope"), { ryanair: true, wizzair: true, watched: true });
  assert.equal(parseDealSections(JSON.stringify({ ryanair: false })).wizzair, true);
  assert.equal(parseDealSections(JSON.stringify({ watched: false })).watched, false);
});

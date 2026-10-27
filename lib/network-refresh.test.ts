import assert from "node:assert/strict";
import test from "node:test";
import { RYANAIR_IATA } from "./airports";
import { loadRyanairNetwork, parseRyanairNetwork, routeSeason, ryanairNetworkUrl } from "./network-refresh";
import { withLiveRyanair } from "./route-map";

function fare(iata: string, city: string, country: string) {
  return {
    outbound: {
      departureAirport: { iataCode: "KRK" },
      arrivalAirport: { iataCode: iata, name: `${city} Airport`, countryName: country, city: { name: city } },
    },
  };
}

test("the network query covers the next 180 days from Krakow", () => {
  const url = ryanairNetworkUrl("2026-10-27") ?? "";
  assert.match(url, /departureAirportIataCode=KRK/);
  assert.match(url, /outboundDepartureDateFrom=2026-10-27/);
  assert.match(url, /outboundDepartureDateTo=2027-04-25/);
  assert.equal(url.includes("arrivalAirportIataCode"), false);
  assert.equal(ryanairNetworkUrl("yesterday"), null);
});

test("a new airport keeps a Polish name and a known one keeps the winter-guide name", () => {
  const airports = parseRyanairNetwork({
    fares: [fare("AGP", "Malaga", "Spain"), fare("PMI", "Palma", "Spain"), fare("ZZZ", "Zzz", "Narnia")],
  });
  assert.ok(airports);
  assert.equal(airports.find((airport) => airport.iata === "AGP")?.city, "Malaga");
  assert.equal(airports.find((airport) => airport.iata === "PMI")?.city, "Palma de Mallorca");
  assert.equal(airports.find((airport) => airport.iata === "ZZZ")?.country, "Narnia");
  assert.equal(parseRyanairNetwork({}), null);
});

test("new airports with coordinates join the map and the winter guide stays", () => {
  const live: { iata: string; city: string; country: string }[] = RYANAIR_IATA.map((iata) => ({
    iata,
    city: iata,
    country: "x",
  }));
  live.push({ iata: "PMI", city: "Palma de Mallorca", country: "Hiszpania" });
  live.push({ iata: "ZZZ", city: "Nieznane", country: "x" });
  const merged = withLiveRyanair(live);
  assert.equal(merged.routes.some((route) => route.iata === "AGP"), true);
  const palma = merged.routes.find((route) => route.iata === "PMI");
  assert.ok(palma);
  assert.ok(palma.x > 0 && palma.x < 100 && palma.y > 0 && palma.y < 100);
  assert.deepEqual(palma.airlines, ["ryanair"]);
  assert.deepEqual(merged.unplaced.map((airport) => airport.iata), ["ZZZ"]);
});

test("the loader reports airports added to and missing from the winter guide", async () => {
  const winter = RYANAIR_IATA.filter((iata) => iata !== "VIE").map((iata) => fare(iata, iata, "Poland"));
  const summer = [fare("AGP", "Malaga", "Spain"), fare("PMI", "Palma", "Spain")];
  const fetchImpl = async (url: string) =>
    new Response(JSON.stringify({ fares: url.includes("2027-03-28") ? summer : winter }));
  const result = await loadRyanairNetwork("2026-10-27", fetchImpl, undefined, new Date("2026-10-27T18:00:00Z"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.added.map((airport) => airport.iata), ["PMI"]);
  assert.deepEqual(result.missing, ["VIE"]);
  assert.equal(result.snapshot.through, "2027-10-30");
  assert.deepEqual(routeSeason("AGP", result.snapshot), { winter: true, summer: true });
  assert.deepEqual(routeSeason("PMI", result.snapshot), { winter: false, summer: true });
  assert.deepEqual(routeSeason("VIE", result.snapshot), { winter: true, summer: false });
  assert.deepEqual(routeSeason("AGP", null), { winter: true, summer: false });
});

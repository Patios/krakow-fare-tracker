import { RYANAIR_IATA, destinationByIata } from "./airports";
import { isIsoDate } from "./format";
import { readJson, type FlightFetch, type FlightReadFailure } from "./flight-day";
import type { Destination } from "./types";

export const NETWORK_WINDOW_DAYS = 180;
const STORAGE_KEY = "krk-fare-tracker.network.v1";

export type NetworkAirport = {
  iata: string;
  city: string;
  airport: string;
  country: string;
};

export type NetworkSnapshot = {
  checkedAt: string;
  through: string;
  airports: NetworkAirport[];
};

export type NetworkLoad =
  | { ok: true; snapshot: NetworkSnapshot; added: NetworkAirport[]; missing: string[] }
  | { ok: false; reason: FlightReadFailure };

const PLACE_NAMES: Record<string, { city: string; country: string }> = {
  AOI: { city: "Ankona", country: "Włochy" },
  ATH: { city: "Ateny", country: "Grecja" },
  CDT: { city: "Castellón", country: "Hiszpania" },
  CFU: { city: "Korfu", country: "Grecja" },
  CHQ: { city: "Chania", country: "Grecja" },
  GRO: { city: "Girona", country: "Hiszpania" },
  LDE: { city: "Lourdes", country: "Francja" },
  OLB: { city: "Olbia", country: "Włochy" },
  PMI: { city: "Palma de Mallorca", country: "Hiszpania" },
  RHO: { city: "Rodos", country: "Grecja" },
  RMI: { city: "Rimini", country: "Włochy" },
  SZZ: { city: "Szczecin", country: "Polska" },
  TGD: { city: "Podgorica", country: "Czarnogóra" },
  TNG: { city: "Tanger", country: "Maroko" },
  TRN: { city: "Turyn", country: "Włochy" },
  ZAD: { city: "Zadar", country: "Chorwacja" },
};

const COUNTRY_PL: Record<string, string> = {
  Greece: "Grecja",
  Spain: "Hiszpania",
  France: "Francja",
  Italy: "Włochy",
  "United Kingdom": "Wielka Brytania",
  Germany: "Niemcy",
  Portugal: "Portugalia",
  Ireland: "Irlandia",
  Norway: "Norwegia",
  Sweden: "Szwecja",
  Denmark: "Dania",
  Finland: "Finlandia",
  Netherlands: "Holandia",
  Belgium: "Belgia",
  Austria: "Austria",
  Hungary: "Węgry",
  Romania: "Rumunia",
  Bulgaria: "Bułgaria",
  Croatia: "Chorwacja",
  Cyprus: "Cypr",
  Malta: "Malta",
  Morocco: "Maroko",
  Montenegro: "Czarnogóra",
  Egypt: "Egipt",
  Israel: "Izrael",
  Albania: "Albania",
  Latvia: "Łotwa",
  Lithuania: "Litwa",
  Estonia: "Estonia",
  Poland: "Polska",
  "Czech Republic": "Czechy",
  Czechia: "Czechy",
};

const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = "";

export function subscribeNetwork(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function getNetworkSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SERVER_SNAPSHOT;
  } catch {
    return SERVER_SNAPSHOT;
  }
}

export function getNetworkServerSnapshot(): string {
  return SERVER_SNAPSHOT;
}

export function parseNetworkSnapshot(raw: string): NetworkSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<NetworkSnapshot>;
    if (typeof value.checkedAt !== "string" || typeof value.through !== "string" || !Array.isArray(value.airports)) {
      return null;
    }
    const airports = value.airports.filter(isAirport).map((airport) => ({
      ...airport,
      airport: airport.airport || airport.city,
    }));
    return airports.length > 0 ? { checkedAt: value.checkedAt, through: value.through, airports } : null;
  } catch {
    return null;
  }
}

export function readNetwork(): NetworkSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  return parseNetworkSnapshot(getNetworkSnapshot());
}

export function saveNetwork(snapshot: NetworkSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // The map still shows this result until the page is reloaded.
  }
  for (const listener of listeners) listener();
}

/** Winter-guide airport, or one found by the last map refresh. */
export function lookupDestination(iata: string): Destination | undefined {
  const known = destinationByIata.get(iata);
  if (known) return known;
  const airport = readNetwork()?.airports.find((item) => item.iata === iata);
  if (!airport) return undefined;
  return { ...airport, airlines: ["ryanair"] };
}

export function networkExtras(): Destination[] {
  const airports = readNetwork()?.airports ?? [];
  return airports
    .filter((airport) => !destinationByIata.has(airport.iata))
    .map((airport) => ({ ...airport, airlines: ["ryanair" as const] }))
    .sort((a, b) => a.city.localeCompare(b.city, "pl"));
}

export function ryanairNetworkUrl(from: string): string | null {
  if (!isIsoDate(from)) return null;
  const to = addIsoDays(from, NETWORK_WINDOW_DAYS);
  const params = new URLSearchParams({
    departureAirportIataCode: "KRK",
    outboundDepartureDateFrom: from,
    outboundDepartureDateTo: to,
    currency: "PLN",
  });
  return `https://www.ryanair.com/api/farfnd/v4/oneWayFares?${params.toString()}`;
}

export function parseRyanairNetwork(payload: unknown): NetworkAirport[] | null {
  if (!payload || typeof payload !== "object") return null;
  const fares = (payload as { fares?: unknown }).fares;
  if (!Array.isArray(fares)) return null;
  const byIata = new Map<string, NetworkAirport>();
  for (const fare of fares) {
    if (!fare || typeof fare !== "object") continue;
    const outbound = (fare as { outbound?: unknown }).outbound;
    if (!outbound || typeof outbound !== "object") continue;
    const record = outbound as {
      departureAirport?: { iataCode?: unknown } | null;
      arrivalAirport?: { iataCode?: unknown; name?: unknown; countryName?: unknown; city?: { name?: unknown } | null } | null;
    };
    if (record.departureAirport?.iataCode !== "KRK") continue;
    const arrival = record.arrivalAirport;
    const iata = arrival?.iataCode;
    if (typeof iata !== "string" || !/^[A-Z]{3}$/.test(iata) || byIata.has(iata)) continue;
    const apiCity = typeof arrival?.city?.name === "string" ? arrival.city.name : iata;
    const apiAirport = typeof arrival?.name === "string" ? arrival.name : apiCity;
    const apiCountry = typeof arrival?.countryName === "string" ? arrival.countryName : "";
    byIata.set(iata, namedAirport(iata, apiCity, apiAirport, apiCountry));
  }
  return [...byIata.values()];
}

export async function loadRyanairNetwork(
  today: string,
  fetchImpl: FlightFetch = fetch,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<NetworkLoad> {
  const url = ryanairNetworkUrl(today);
  if (!url) return { ok: false, reason: "unreadable" };
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return read;
  const airports = parseRyanairNetwork(read.payload);
  if (!airports || airports.length === 0) return { ok: false, reason: "unreadable" };
  const snapshot = { checkedAt: now.toISOString(), through: addIsoDays(today, NETWORK_WINDOW_DAYS), airports };
  const live = new Set(airports.map((airport) => airport.iata));
  const guide = new Set<string>(RYANAIR_IATA);
  return {
    ok: true,
    snapshot,
    added: airports.filter((airport) => !guide.has(airport.iata)),
    missing: RYANAIR_IATA.filter((iata) => !live.has(iata)),
  };
}

function namedAirport(iata: string, apiCity: string, apiAirport: string, apiCountry: string): NetworkAirport {
  const known = destinationByIata.get(iata);
  if (known) return { iata, city: known.city, airport: known.airport, country: known.country };
  const named = PLACE_NAMES[iata];
  return {
    iata,
    city: named?.city ?? apiCity,
    airport: apiAirport,
    country: named?.country ?? COUNTRY_PL[apiCountry] ?? (apiCountry || "nieznany kraj"),
  };
}

function isAirport(value: unknown): value is NetworkAirport {
  if (!value || typeof value !== "object") return false;
  const airport = value as Partial<NetworkAirport>;
  return (
    typeof airport.iata === "string" &&
    /^[A-Z]{3}$/.test(airport.iata) &&
    typeof airport.city === "string" &&
    airport.city.length > 0 &&
    typeof airport.country === "string"
  );
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

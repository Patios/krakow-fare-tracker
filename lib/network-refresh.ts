import { RYANAIR_IATA, destinationByIata } from "./airports";
import { isIsoDate } from "./format";
import { readJson, type FlightFetch, type FlightReadFailure } from "./flight-day";
import type { Destination } from "./types";
import { readWizz } from "./wizz-data";

export const NETWORK_WINDOW_DAYS = 180;
const STORAGE_KEY = "krk-fare-tracker.network.v1";

export type NetworkAirport = {
  iata: string;
  city: string;
  airport: string;
  country: string;
};

/** IATA northern winter 2026/27 ends the day before the summer season. */
export const WINTER_SEASON_END = "2027-03-27";
export const SUMMER_SEASON_START = "2027-03-28";
export const SUMMER_SEASON_END = "2027-10-30";

export type NetworkSnapshot = {
  checkedAt: string;
  through: string;
  airports: NetworkAirport[];
  /** Set after a refresh that asked Ryanair about each season. Missing on older saved results. */
  winterIata?: string[];
  summerIata?: string[];
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
    if (airports.length === 0) return null;
    const snapshot: NetworkSnapshot = { checkedAt: value.checkedAt, through: value.through, airports };
    if (Array.isArray(value.winterIata) && Array.isArray(value.summerIata)) {
      snapshot.winterIata = value.winterIata.filter(isIata);
      snapshot.summerIata = value.summerIata.filter(isIata);
    }
    return snapshot;
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

/** Winter-guide airport, one found by the last map refresh, or one in the published Wizz timetable. */
export function lookupDestination(iata: string): Destination | undefined {
  const wizz = readWizz()?.destinations.find((item) => item.iata === iata);
  const known = destinationByIata.get(iata);
  if (known) {
    return wizz && !known.airlines.includes("wizzair") ? { ...known, airlines: [...known.airlines, "wizzair"] } : known;
  }
  const airport = readNetwork()?.airports.find((item) => item.iata === iata);
  if (airport) return { ...airport, airlines: wizz ? ["ryanair", "wizzair"] : ["ryanair"] };
  if (wizz) return { iata, city: wizz.city, airport: wizz.city, country: wizz.country, airlines: ["wizzair"] };
  return undefined;
}

export function networkExtras(): Destination[] {
  const airports = readNetwork()?.airports ?? [];
  return airports
    .filter((airport) => !destinationByIata.has(airport.iata))
    .map((airport) => ({ ...airport, airlines: ["ryanair" as const] }))
    .sort((a, b) => a.city.localeCompare(b.city, "pl"));
}

export function seasonRanges(today: string): {
  winter: { from: string; to: string } | null;
  summer: { from: string; to: string } | null;
} {
  if (!isIsoDate(today)) return { winter: null, summer: null };
  const winterFrom = today < "2026-10-25" ? "2026-10-25" : today;
  const summerFrom = today > SUMMER_SEASON_START ? today : SUMMER_SEASON_START;
  return {
    winter: winterFrom <= WINTER_SEASON_END ? { from: winterFrom, to: WINTER_SEASON_END } : null,
    summer: summerFrom <= SUMMER_SEASON_END ? { from: summerFrom, to: SUMMER_SEASON_END } : null,
  };
}

/** Snow for the winter schedule, sun for the summer schedule. A year-round route has both. */
export function routeSeason(iata: string, network: NetworkSnapshot | null): { summer: boolean; winter: boolean } {
  const inWinterGuide = destinationByIata.has(iata);
  if (!network?.winterIata || !network.summerIata) return { winter: inWinterGuide, summer: false };
  return {
    winter: inWinterGuide || network.winterIata.includes(iata),
    summer: network.summerIata.includes(iata),
  };
}

export function ryanairNetworkUrl(from: string, to?: string): string | null {
  if (!isIsoDate(from)) return null;
  const end = to ?? addIsoDays(from, NETWORK_WINDOW_DAYS);
  if (!isIsoDate(end) || end < from) return null;
  const params = new URLSearchParams({
    departureAirportIataCode: "KRK",
    outboundDepartureDateFrom: from,
    outboundDepartureDateTo: end,
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
  const ranges = seasonRanges(today);
  if (!ranges.winter && !ranges.summer) return { ok: false, reason: "unreadable" };
  const [winterAirports, summerAirports] = await Promise.all([
    ranges.winter ? readSeason(ranges.winter.from, ranges.winter.to, fetchImpl, signal) : Promise.resolve([] as NetworkAirport[]),
    ranges.summer ? readSeason(ranges.summer.from, ranges.summer.to, fetchImpl, signal) : Promise.resolve([] as NetworkAirport[]),
  ]);
  if (winterAirports === null || summerAirports === null) {
    return { ok: false, reason: winterAirports === null && summerAirports === null ? "blocked" : "unreadable" };
  }
  const airports = mergeAirports(winterAirports, summerAirports);
  if (airports.length === 0) return { ok: false, reason: "unreadable" };
  const snapshot: NetworkSnapshot = {
    checkedAt: now.toISOString(),
    through: ranges.summer?.to ?? ranges.winter?.to ?? today,
    airports,
    winterIata: winterAirports.map((airport) => airport.iata).sort(),
    summerIata: summerAirports.map((airport) => airport.iata).sort(),
  };
  const live = new Set(snapshot.winterIata);
  const guide = new Set<string>(RYANAIR_IATA);
  return {
    ok: true,
    snapshot,
    added: airports.filter((airport) => !guide.has(airport.iata)),
    missing: RYANAIR_IATA.filter((iata) => !live.has(iata)),
  };
}

async function readSeason(
  from: string,
  to: string,
  fetchImpl: FlightFetch,
  signal?: AbortSignal,
): Promise<NetworkAirport[] | null> {
  const url = ryanairNetworkUrl(from, to);
  if (!url) return null;
  const read = await readJson(url, fetchImpl, signal);
  if (!read.ok) return null;
  return parseRyanairNetwork(read.payload);
}

function mergeAirports(winter: NetworkAirport[], summer: NetworkAirport[]): NetworkAirport[] {
  const byIata = new Map<string, NetworkAirport>();
  for (const airport of [...winter, ...summer]) {
    if (!byIata.has(airport.iata)) byIata.set(airport.iata, airport);
  }
  return [...byIata.values()];
}

function isIata(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
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

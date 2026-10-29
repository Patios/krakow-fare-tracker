/**
 * Reads Wizz Air destinations and timetable fares from KRK and writes public/wizz.json.
 * Runs in GitHub Actions before the Pages build. A failed run keeps the last published file.
 *
 *   npx tsx scripts/fetch-wizz.ts
 *   WIZZ_PREVIOUS_URL=https://patios.github.io/krakow-fare-tracker/wizz.json npx tsx scripts/fetch-wizz.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { parseWizzData, parseWizzTimetable, type WizzData, type WizzDestination } from "../lib/wizz-data";

const ORIGIN = "KRK";
const FALLBACK_VERSION = "29.22.0";
const DAYS_AHEAD = 240;
const CHUNK_DAYS = 40;
const PAUSE_MS = 900;
const RETRY_PASS_PAUSE_MS = 30_000;
const OUTPUT = new URL("../public/wizz.json", import.meta.url);
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  Origin: "https://wizzair.com",
  Referer: "https://wizzair.com/",
  Accept: "application/json",
};

async function main() {
  const previous = await readPrevious();
  const version = await apiVersion();
  const destinations = await readDestinations(version);
  if (!destinations) {
    console.warn("Wizz map did not answer.");
    return keep(previous);
  }

  const today = new Date().toISOString().slice(0, 10);
  const through = addDays(today, DAYS_AHEAD);
  const fares: WizzData["fares"] = {};
  let waiting = destinations;

  for (let pass = 0; pass < 2 && waiting.length > 0; pass += 1) {
    if (pass > 0) await pause(RETRY_PASS_PAUSE_MS);
    const failedThisPass: WizzDestination[] = [];
    for (const destination of waiting) {
      const days = await readDestination(version, destination, today, through);
      if (days) fares[destination.iata] = days;
      else failedThisPass.push(destination);
      console.log(`${destination.iata}: ${days ? `${days.out.length} + ${days.back.length} dni` : "bez odpowiedzi"}`);
    }
    waiting = failedThisPass;
  }
  for (const destination of waiting) {
    if (previous?.fares[destination.iata]) fares[destination.iata] = previous.fares[destination.iata];
  }
  const failed = waiting.length;

  if (failed === destinations.length) {
    console.warn("No Wizz timetable answered.");
    return keep(previous);
  }

  const data: WizzData = { checkedAt: new Date().toISOString(), apiVersion: version, through, destinations, fares };
  await save(data);
  console.log(`Saved ${destinations.length} destinations, ${failed} without an answer.`);
}

async function readDestination(version: string, destination: WizzDestination, today: string, through: string) {
  const out = new Map<string, WizzData["fares"][string]["out"][number]>();
  const back = new Map<string, WizzData["fares"][string]["back"][number]>();
  for (let from = maxDate(today, destination.startsOn ?? today); from <= through; from = addDays(from, CHUNK_DAYS + 1)) {
    const to = minDate(addDays(from, CHUNK_DAYS), through);
    const days = await readTimetable(version, destination.iata, from, to);
    if (!days) return null;
    for (const day of days.out) out.set(day[0], day);
    for (const day of days.back) back.set(day[0], day);
  }
  return { out: [...out.values()], back: [...back.values()] };
}

async function apiVersion(): Promise<string> {
  try {
    const html = await (await fetch("https://wizzair.com/", { headers: HEADERS })).text();
    return /be\.wizzair\.com\/(\d+\.\d+\.\d+)/.exec(html)?.[1] ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

async function readDestinations(version: string): Promise<WizzDestination[] | null> {
  try {
    const response = await fetch(`https://be.wizzair.com/${version}/Api/asset/map?languageCode=pl-pl`, { headers: HEADERS });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      cities?: {
        iata: string;
        shortName?: string;
        countryName?: string;
        isFakeStation?: boolean;
        connections?: { iata: string; operationStartDate?: string; isDirectFlight?: boolean }[];
      }[];
    };
    const cities = new Map((payload.cities ?? []).map((city) => [city.iata, city]));
    const origin = cities.get(ORIGIN);
    if (!origin?.connections) return null;
    return origin.connections
      .filter((connection) => connection.isDirectFlight !== false)
      .map((connection) => ({ connection, city: cities.get(connection.iata) }))
      .filter(({ city }) => city && !city.isFakeStation && !/wszystkie lotniska/i.test(city.shortName ?? ""))
      .map(({ connection, city }) => ({
        iata: connection.iata,
        city: (city?.shortName ?? connection.iata).trim().replace(/-/g, " "),
        country: (city?.countryName ?? "").trim(),
        startsOn: connection.operationStartDate?.slice(0, 10) ?? null,
      }))
      .sort((a, b) => a.iata.localeCompare(b.iata));
  } catch {
    return null;
  }
}

async function readTimetable(version: string, iata: string, from: string, to: string) {
  const body = JSON.stringify({
    flightList: [
      { departureStation: ORIGIN, arrivalStation: iata, from, to },
      { departureStation: iata, arrivalStation: ORIGIN, from, to },
    ],
    priceType: "regular",
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pause(attempt === 0 ? PAUSE_MS : 15_000 * attempt);
    try {
      const response = await fetch(`https://be.wizzair.com/${version}/Api/search/timetable`, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body,
      });
      if (response.status === 429 || response.status >= 500) {
        console.warn(`${iata} ${from}: HTTP ${response.status}`);
        continue;
      }
      if (response.status === 400) return { out: [], back: [] };
      if (!response.ok) return null;
      return parseWizzTimetable(await response.json());
    } catch {
      continue;
    }
  }
  return null;
}

async function readPrevious(): Promise<WizzData | null> {
  const url = process.env.WIZZ_PREVIOUS_URL;
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? parseWizzData(await response.json()) : null;
  } catch {
    return null;
  }
}

async function keep(previous: WizzData | null) {
  if (previous) {
    await save(previous);
    console.warn(`Kept the file from ${previous.checkedAt}.`);
  }
}

async function save(data: WizzData) {
  await mkdir(new URL("../public/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(data));
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function minDate(a: string, b: string) {
  return a < b ? a : b;
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 0;
});

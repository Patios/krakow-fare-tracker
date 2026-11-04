/**
 * Reads Ryanair's monthly calendars from KRK and writes public/ryanair.json.
 * Runs from .github/workflows/ryanair.yml. Failed calendar months retain only
 * their matching previous leg, and the per-leg timestamp exposes that fallback.
 *
 *   npx tsx scripts/fetch-ryanair.ts
 *   RYANAIR_PREVIOUS_URL=https://patios.github.io/krakow-fare-tracker/ryanair.json npx tsx scripts/fetch-ryanair.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseRyanairMonth, ryanairMonthUrl, type CalendarDay } from "../lib/fare-calendar";
import { parseRyanairNetwork } from "../lib/network-refresh";
import { parseRyanairData, type RyanairData, type RyanairDay, type RyanairDestination, type RyanairFares } from "../lib/ryanair-data";

const ORIGIN = "KRK";
/** Keep the published snapshot small and useful for near-term fare decisions. */
const MONTHS_AHEAD = 1;
const CONCURRENCY = 1;
const PAUSE_MS = 700;
const RETRY_PAUSE_MS = 10_000;
const OUTPUT = new URL("../public/ryanair.json", import.meta.url);
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  Accept: "application/json",
};

async function main() {
  const previous = await readPrevious();
  const today = new Date().toISOString().slice(0, 10);
  const through = addMonths(today, MONTHS_AHEAD);
  const destinations = await readDestinations(today, through);
  if (!destinations || destinations.length === 0) {
    console.warn("Ryanair route map did not answer.");
    await keep(previous);
    process.exitCode = 1;
    return;
  }

  const months = monthsBetween(today, through);
  const fares: RyanairData["fares"] = {};
  const checkedAt = new Date().toISOString();
  let cursor = 0;
  let failedLegs = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, destinations.length) }, async () => {
      for (;;) {
        const destination = destinations[cursor++];
        if (!destination) return;
        const result = await readDestination(destination.iata, months, today, through, previous?.fares[destination.iata], checkedAt);
        fares[destination.iata] = result.fares;
        failedLegs += result.failedLegs;
        console.log(`${destination.iata}: ${result.fares.out.length} + ${result.fares.back.length} dni${result.failedLegs ? " (częściowo z poprzedniego pliku)" : ""}`);
      }
    }),
  );

  if (failedLegs === destinations.length * 2 || Object.keys(fares).length === 0) {
    console.warn("No Ryanair calendars answered.");
    await keep(previous);
    process.exitCode = 1;
    return;
  }

  const data: RyanairData = { checkedAt, through, destinations, fares };
  await save(data);
  console.log(`Saved ${destinations.length} destinations, ${failedLegs} leg reads without an answer.`);
}

async function readDestinations(from: string, to: string): Promise<RyanairDestination[] | null> {
  const params = new URLSearchParams({
    departureAirportIataCode: ORIGIN,
    outboundDepartureDateFrom: from,
    outboundDepartureDateTo: to,
    currency: "PLN",
  });
  const payload = await readJson(`https://www.ryanair.com/api/farfnd/v4/oneWayFares?${params.toString()}`);
  const airports = payload ? parseRyanairNetwork(payload) : null;
  return airports?.map(({ iata, city, country }) => ({ iata, city, country })).sort((a, b) => a.iata.localeCompare(b.iata)) ?? null;
}

async function readDestination(
  iata: string,
  months: string[],
  from: string,
  through: string,
  previous: RyanairFares | undefined,
  checkedAt: string,
): Promise<{ fares: RyanairFares; failedLegs: number }> {
  const [out, back] = await Promise.all([
    readLeg(ORIGIN, iata, months, from, through, previous?.out ?? [], previous?.outCheckedAt ?? null, checkedAt),
    readLeg(iata, ORIGIN, months, from, through, previous?.back ?? [], previous?.backCheckedAt ?? null, checkedAt),
  ]);
  return {
    fares: { out: out.days, back: back.days, outCheckedAt: out.checkedAt, backCheckedAt: back.checkedAt },
    failedLegs: Number(out.failed) + Number(back.failed),
  };
}

async function readLeg(
  origin: string,
  destination: string,
  months: string[],
  from: string,
  through: string,
  previous: RyanairDay[],
  previousCheckedAt: string | null,
  checkedAt: string,
): Promise<{ days: RyanairDay[]; checkedAt: string | null; failed: boolean }> {
  const days: RyanairDay[] = [];
  let failed = false;
  for (const month of months) {
    await pause(PAUSE_MS);
    const url = ryanairMonthUrl(origin, destination, month);
    const payload = url ? await readJson(url) : null;
    const calendar = payload ? parseRyanairMonth(payload, month) : null;
    failed ||= mergeLegMonth(days, calendar, previous, month, from, through);
  }
  return { days, checkedAt: failed ? previousCheckedAt : checkedAt, failed };
}

/** Returns true when a failed month had to be filled from the earlier snapshot. */
export function mergeLegMonth(
  days: RyanairDay[],
  calendar: CalendarDay[] | null,
  previous: RyanairDay[],
  month: string,
  from: string,
  through: string,
): boolean {
  if (!calendar) {
    days.push(...previous.filter((day) => day[0] >= from && day[0] <= through && day[0].startsWith(month.slice(0, 7))));
    return true;
  }
  days.push(...calendar.filter((day) => day.date >= from && day.date <= through && day.status === "fare" && day.amount != null).map(toDay));
  return false;
}

function toDay(day: CalendarDay): RyanairDay {
  return [day.date, day.amount as number, day.departs, day.arrives];
}

async function readJson(url: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (response.ok) return await response.json();
      console.warn(`${new URL(url).pathname}: HTTP ${response.status}`);
      if (!shouldRetry(response.status)) return null;
    } catch {
      // Retry transient network failures below.
    }
    if (attempt < 2) await pause(RETRY_PAUSE_MS * (attempt + 1));
  }
  return null;
}

export function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function readPrevious(): Promise<RyanairData | null> {
  const url = process.env.RYANAIR_PREVIOUS_URL;
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? parseRyanairData(await response.json()) : null;
  } catch {
    return null;
  }
}

async function keep(previous: RyanairData | null) {
  if (previous) {
    await save(previous);
    console.warn(`Kept the file from ${previous.checkedAt}.`);
  }
}

async function save(data: RyanairData) {
  await mkdir(new URL("../public/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(data));
}

function monthsBetween(from: string, through: string): string[] {
  const months: string[] = [];
  for (let month = `${from.slice(0, 7)}-01`; month <= through; month = nextMonth(month)) months.push(month);
  return months;
}

function nextMonth(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/** One calendar month later, clamped for dates such as 31 January. */
function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const value = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return value.toISOString().slice(0, 10);
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

import { roundMoney } from "./format";
import { lookupDestination } from "./network-refresh";
import { lastOutboundDay, orderedLogs } from "./routes";
import type { Airline, PriceLog, WatchedRoute } from "./types";
import { liveRyanairFare, type RyanairData } from "./ryanair-data";
import { liveWizzFare, type WizzData } from "./wizz-data";

export type DealRecommendation = {
  route: WatchedRoute;
  airline: Airline;
  latest: PriceLog;
  previous: PriceLog | null;
  historicalLow: number;
  median: number | null;
  observedPrices: number;
  percentBelowMedian: number | null;
  percentDrop: number | null;
  verdict: "book" | "good" | "current";
  fresh: boolean;
  source: "history" | "ryanair-file" | "wizz-file";
  /** The published day behind a snapshot price. History deals keep the route window instead. */
  pricedOutbound: string | null;
  pricedReturn: string | null;
};

export type BestDealOptions = {
  limit?: number;
  ryanair?: RyanairData | null;
  wizz?: WizzData | null;
};

/**
 * Finds strong, current prices for trips whose outbound window overlaps the next 31 days.
 * Prices are compared only with the same route and airline, so unlike trips never skew a deal.
 */
export function bestDeals(
  routes: WatchedRoute[],
  logs: PriceLog[],
  today: string,
  { limit = 5, ryanair = null, wizz = null }: BestDealOptions = {},
): DealRecommendation[] {
  const through = addDays(today, 30);
  const deals = routes.flatMap((route) => {
    if (route.outboundFrom > through || lastOutboundDay(route) < today) return [];
    const routeLogs = orderedLogs(logs, route.id);
    const ryanairHistory = routeLogs.filter((log) => log.airline === "ryanair");
    const currentRyanair = lookupDestination(route.destinationIata)?.airlines.includes("ryanair")
      ? liveRyanairFare(route, ryanair, today)
      : null;
    const ryanairDeal = currentRyanair
      ? recommendationFromSnapshot(route, ryanairHistory, currentRyanair, currentRyanair.checkedAt ?? today, today, "ryanair", "FR", "ryanair-file")
      : recommendationFor(route, ryanairHistory, today);
    const wizzHistory = routeLogs.filter((log) => log.airline === "wizzair");
    const currentWizz = liveWizzFare(route, wizz, today);
    const wizzDeal = currentWizz
      ? recommendationFromSnapshot(route, wizzHistory, currentWizz, wizz?.checkedAt ?? today, today, "wizzair", "W6", "wizz-file")
      : recommendationFor(route, wizzHistory, today);
    return [ryanairDeal, wizzDeal].filter((deal): deal is DealRecommendation => deal != null);
  });

  return deals
    .sort((a, b) => {
      if (a.verdict !== b.verdict) return verdictRank(a.verdict) - verdictRank(b.verdict);
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
      const aStrength = Math.max(a.percentBelowMedian ?? 0, a.percentDrop ?? 0);
      const bStrength = Math.max(b.percentBelowMedian ?? 0, b.percentDrop ?? 0);
      if (aStrength !== bStrength) return bStrength - aStrength;
      return a.latest.amount - b.latest.amount;
    })
    .slice(0, limit);
}

function recommendationFor(
  route: WatchedRoute,
  logs: PriceLog[],
  today: string,
  source: DealRecommendation["source"] = "history",
): DealRecommendation | null {
  const latest = logs[0];
  if (!latest || logs.length < 2) return null;

  const prices = logs.map((log) => log.amount);
  const historicalLow = Math.min(...prices);
  const median = prices.length >= 3 ? medianOf(prices) : null;
  const previous = logs[1] ?? null;
  const percentBelowMedian = median != null ? percentDecrease(median, latest.amount) : null;
  const percentDrop = previous ? percentDecrease(previous.amount, latest.amount) : null;
  // Two readings make every drop a "historical low", so that label needs a longer history.
  const atHistoricalLow = prices.length >= 3 && latest.amount <= historicalLow;

  const verdict =
    atHistoricalLow || (percentBelowMedian != null && percentBelowMedian >= 15) || (percentDrop != null && percentDrop >= 15)
      ? "book"
      : (percentBelowMedian != null && percentBelowMedian >= 8) || (percentDrop != null && percentDrop >= 8)
        ? "good"
        : null;
  if (!verdict) return null;

  return {
    route,
    airline: latest.airline,
    latest,
    previous,
    historicalLow,
    median,
    observedPrices: prices.length,
    percentBelowMedian,
    percentDrop,
    verdict,
    fresh: daysBetween(latest.checkedOn, today) <= 2,
    source,
    pricedOutbound: null,
    pricedReturn: null,
  };
}

function recommendationFromSnapshot(
  route: WatchedRoute,
  history: PriceLog[],
  fare: {
    amount: number;
    outboundDate: string;
    outboundDepart: string | null;
    returnDate: string | null;
    returnDepart: string | null;
  },
  checkedAt: string,
  today: string,
  airline: Airline,
  flightPrefix: string,
  source: Extract<DealRecommendation["source"], "ryanair-file" | "wizz-file">,
): DealRecommendation | null {
  const latest: PriceLog = {
    id: `${source}-${route.id}`,
    routeId: route.id,
    airline,
    amount: fare.amount,
    currency: "PLN",
    checkedOn: checkedAt.slice(0, 10),
    outboundDepart: fare.outboundDepart,
    outboundArrive: null,
    returnDepart: fare.returnDepart,
    returnArrive: null,
    createdAt: checkedAt,
    autoFlights: `${flightPrefix} ${fare.outboundDate}${fare.returnDate ? `; ${flightPrefix} ${fare.returnDate}` : ""}`,
  };
  const series = [latest, ...history.filter((log) => log.checkedOn !== latest.checkedOn || log.amount !== latest.amount)];
  const assessed = recommendationFor(route, series, today, source);
  if (assessed) {
    return { ...assessed, pricedOutbound: fare.outboundDate, pricedReturn: fare.returnDate };
  }
  // Enough history to judge, and this price is not a deal.
  if (series.length >= 2) return null;

  const prices = [latest.amount, ...history.map((log) => log.amount)];
  return {
    route,
    airline,
    latest,
    previous: history[0] ?? null,
    historicalLow: Math.min(...prices),
    median: prices.length >= 3 ? medianOf(prices) : null,
    observedPrices: prices.length,
    percentBelowMedian: null,
    percentDrop: null,
    verdict: "current",
    fresh: daysBetween(latest.checkedOn, today) <= 2,
    source,
    pricedOutbound: fare.outboundDate,
    pricedReturn: fare.returnDate,
  };
}

function verdictRank(verdict: DealRecommendation["verdict"]): number {
  return verdict === "book" ? 0 : verdict === "good" ? 1 : 2;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : roundMoney((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentDecrease(reference: number, amount: number): number | null {
  if (amount >= reference || reference <= 0) return null;
  return roundMoney(((reference - amount) / reference) * 100);
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

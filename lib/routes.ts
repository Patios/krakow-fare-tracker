import { destinationByIata } from "./airports";
import { roundMoney } from "./format";
import type { PriceLog, SearchTrip, WatchedRoute } from "./types";

export function orderedLogs(logs: PriceLog[], routeId: string): PriceLog[] {
  return logs
    .filter((log) => log.routeId === routeId)
    .sort((a, b) => {
      if (a.checkedOn !== b.checkedOn) return a.checkedOn < b.checkedOn ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
}

export function lowestLoggedPrice(logs: PriceLog[]): number | null {
  if (logs.length === 0) return null;
  return logs.reduce((lowest, log) => Math.min(lowest, log.amount), Number.POSITIVE_INFINITY);
}

export type PriceDrop = {
  latest: PriceLog;
  previous: PriceLog;
  delta: number;
};

export function priceDrop(logsNewestFirst: PriceLog[]): PriceDrop | null {
  if (logsNewestFirst.length < 2) return null;
  const latest = logsNewestFirst[0];
  const previous = logsNewestFirst[1];
  if (latest.amount >= previous.amount) return null;
  return {
    latest,
    previous,
    delta: roundMoney(previous.amount - latest.amount),
  };
}

export function sortRoutes(routes: WatchedRoute[], logs: PriceLog[]): WatchedRoute[] {
  const label = (route: WatchedRoute) =>
    destinationByIata.get(route.destinationIata)?.city ?? route.destinationIata;

  return [...routes].sort((a, b) => {
    const aPrice = lowestLoggedPrice(orderedLogs(logs, a.id));
    const bPrice = lowestLoggedPrice(orderedLogs(logs, b.id));
    if (aPrice == null && bPrice == null) return label(a).localeCompare(label(b), "pl");
    if (aPrice == null) return 1;
    if (bPrice == null) return -1;
    if (aPrice !== bPrice) return aPrice - bPrice;
    return label(a).localeCompare(label(b), "pl");
  });
}

export function sameTrip(a: SearchTrip & { destinationIata: string }, b: SearchTrip & { destinationIata: string }) {
  return (
    a.destinationIata === b.destinationIata &&
    a.outboundFrom === b.outboundFrom &&
    a.outboundTo === b.outboundTo &&
    a.returnDate === b.returnDate
  );
}

export function normalizeTrip(trip: SearchTrip): SearchTrip {
  const outboundTo = trip.outboundTo && trip.outboundTo !== trip.outboundFrom ? trip.outboundTo : null;
  return {
    outboundFrom: trip.outboundFrom,
    outboundTo,
    returnDate: trip.returnDate,
  };
}

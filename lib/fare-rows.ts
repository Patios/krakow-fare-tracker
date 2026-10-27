import { isIsoDate, parseTimeInput, roundMoney } from "./format";
import type { Airline, PriceLog, StoreData, WatchedRoute } from "./types";

export type FareRouteInsert = {
  id: string;
  destination_iata: string;
  outbound_from: string;
  outbound_to: string | null;
  return_date: string | null;
  created_at: string;
};

export type FarePriceInsert = {
  id: string;
  route_id: string;
  airline: Airline;
  amount: number;
  currency: "PLN";
  checked_on: string;
  outbound_depart: string | null;
  outbound_arrive: string | null;
  return_depart: string | null;
  return_arrive: string | null;
  created_at: string;
};

export function routeToRow(route: WatchedRoute): FareRouteInsert {
  return {
    id: route.id,
    destination_iata: route.destinationIata,
    outbound_from: route.outboundFrom,
    outbound_to: route.outboundTo,
    return_date: route.returnDate,
    created_at: route.createdAt,
  };
}

export function priceToRow(log: PriceLog): FarePriceInsert {
  return {
    id: log.id,
    route_id: log.routeId,
    airline: log.airline,
    amount: log.amount,
    currency: "PLN",
    checked_on: log.checkedOn,
    outbound_depart: log.outboundDepart,
    outbound_arrive: log.outboundArrive,
    return_depart: log.returnDepart,
    return_arrive: log.returnArrive,
    created_at: log.createdAt,
  };
}

export function routeFromRow(value: unknown): WatchedRoute | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (typeof row.destination_iata !== "string" || !/^[A-Z]{3}$/.test(row.destination_iata)) return null;
  const outboundFrom = dateOnly(row.outbound_from);
  const outboundTo = row.outbound_to == null ? null : dateOnly(row.outbound_to);
  const returnDate = row.return_date == null ? null : dateOnly(row.return_date);
  if (!outboundFrom || (row.outbound_to != null && !outboundTo) || (row.return_date != null && !returnDate)) {
    return null;
  }
  if (typeof row.created_at !== "string" || row.created_at.length === 0) return null;
  return {
    id: row.id,
    destinationIata: row.destination_iata,
    outboundFrom,
    outboundTo,
    returnDate,
    createdAt: row.created_at,
  };
}

export function priceFromRow(value: unknown): PriceLog | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (typeof row.route_id !== "string" || row.route_id.length === 0) return null;
  if (row.airline !== "ryanair" && row.airline !== "wizzair") return null;
  const amount = readAmount(row.amount);
  if (amount == null) return null;
  if (row.currency !== "PLN") return null;
  const checkedOn = dateOnly(row.checked_on);
  if (!checkedOn) return null;
  if (typeof row.created_at !== "string" || row.created_at.length === 0) return null;
  const outboundDepart = readTime(row.outbound_depart);
  const outboundArrive = readTime(row.outbound_arrive);
  const returnDepart = readTime(row.return_depart);
  const returnArrive = readTime(row.return_arrive);
  if (
    outboundDepart === "invalid" ||
    outboundArrive === "invalid" ||
    returnDepart === "invalid" ||
    returnArrive === "invalid"
  ) {
    return null;
  }
  return {
    id: row.id,
    routeId: row.route_id,
    airline: row.airline,
    amount,
    currency: "PLN",
    checkedOn,
    createdAt: row.created_at,
    outboundDepart,
    outboundArrive,
    returnDepart,
    returnArrive,
  };
}

export function storeFromRows(routeRows: unknown[], priceRows: unknown[]): StoreData {
  const routes = routeRows.map(routeFromRow).filter((route): route is WatchedRoute => route != null);
  const routeIds = new Set(routes.map((route) => route.id));
  const logs = priceRows
    .map(priceFromRow)
    .filter((log): log is PriceLog => log != null && routeIds.has(log.routeId));
  return { routes, logs };
}

/** Keeps every remote row and adds local rows the account does not have yet. */
export function mergeStores(remote: StoreData, local: StoreData): {
  merged: StoreData;
  extraRoutes: WatchedRoute[];
  extraLogs: PriceLog[];
} {
  const routes = [...remote.routes];
  const routeIds = new Set(routes.map((route) => route.id));
  const extraRoutes = local.routes.filter((route) => !routeIds.has(route.id));
  for (const route of extraRoutes) {
    routes.push(route);
    routeIds.add(route.id);
  }
  const logs = [...remote.logs.filter((log) => routeIds.has(log.routeId))];
  const logIds = new Set(logs.map((log) => log.id));
  const extraLogs = local.logs.filter((log) => !logIds.has(log.id) && routeIds.has(log.routeId));
  return { merged: { routes, logs: [...logs, ...extraLogs] }, extraRoutes, extraLogs };
}

export function cloudChanges(previous: StoreData, next: StoreData): {
  addedRoutes: WatchedRoute[];
  removedRouteIds: string[];
  addedLogs: PriceLog[];
  removedLogIds: string[];
} {
  const nextRouteIds = new Set(next.routes.map((route) => route.id));
  const previousRouteIds = new Set(previous.routes.map((route) => route.id));
  const removedRouteIds = previous.routes.filter((route) => !nextRouteIds.has(route.id)).map((route) => route.id);
  const removedRouteIdSet = new Set(removedRouteIds);
  const nextLogIds = new Set(next.logs.map((log) => log.id));
  const previousLogIds = new Set(previous.logs.map((log) => log.id));
  return {
    addedRoutes: next.routes.filter((route) => !previousRouteIds.has(route.id)),
    removedRouteIds,
    addedLogs: next.logs.filter((log) => !previousLogIds.has(log.id)),
    removedLogIds: previous.logs
      .filter((log) => !nextLogIds.has(log.id) && !removedRouteIdSet.has(log.routeId))
      .map((log) => log.id),
  };
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  return isIsoDate(date) ? date : null;
}

function readAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundMoney(amount);
}

function readTime(value: unknown): string | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return parseTimeInput(value);
}

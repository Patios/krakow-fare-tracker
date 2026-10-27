import type { Airline, PriceLog, StoreData, WatchedRoute } from "./types";
import { isIsoDate, parseTimeInput } from "./format";

export const STORAGE_KEY = "krk-fare-tracker.v1";

const LOADING = "__loading__";
const BLOCKED = "__blocked__";

const listeners = new Set<() => void>();
let cachedSnapshot: string | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    cachedSnapshot = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): string {
  let raw: string;
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    raw = BLOCKED;
  }
  if (cachedSnapshot !== raw) cachedSnapshot = raw;
  return cachedSnapshot;
}

export function getServerSnapshot(): string {
  return LOADING;
}

export function isLoadingSnapshot(snapshot: string): boolean {
  return snapshot === LOADING;
}

export function isBlockedSnapshot(snapshot: string): boolean {
  return snapshot === BLOCKED;
}

function isAirline(value: unknown): value is Airline {
  return value === "ryanair" || value === "wizzair";
}

function readRoute(value: unknown): WatchedRoute | null {
  if (!value || typeof value !== "object") return null;
  const route = value as Partial<WatchedRoute>;
  if (typeof route.id !== "string" || route.id.length === 0) return null;
  if (typeof route.destinationIata !== "string" || !/^[A-Z]{3}$/.test(route.destinationIata)) {
    return null;
  }
  if (typeof route.outboundFrom !== "string" || !isIsoDate(route.outboundFrom)) return null;
  if (route.outboundTo !== null && (typeof route.outboundTo !== "string" || !isIsoDate(route.outboundTo))) {
    return null;
  }
  if (route.returnDate !== null && (typeof route.returnDate !== "string" || !isIsoDate(route.returnDate))) {
    return null;
  }
  if (typeof route.createdAt !== "string" || route.createdAt.length === 0) return null;
  const parsed: WatchedRoute = {
    id: route.id,
    destinationIata: route.destinationIata,
    outboundFrom: route.outboundFrom,
    outboundTo: route.outboundTo ?? null,
    returnDate: route.returnDate ?? null,
    createdAt: route.createdAt,
  };
  const timeFields = ["outboundDepart", "outboundArrive", "returnDepart", "returnArrive"] as const;
  if (!timeFields.some((key) => Object.prototype.hasOwnProperty.call(route, key))) return parsed;
  const outboundDepart = readOptionalTime(route.outboundDepart);
  const outboundArrive = readOptionalTime(route.outboundArrive);
  const returnDepart = readOptionalTime(route.returnDepart);
  const returnArrive = readOptionalTime(route.returnArrive);
  if (
    outboundDepart === "invalid" ||
    outboundArrive === "invalid" ||
    returnDepart === "invalid" ||
    returnArrive === "invalid"
  ) {
    return null;
  }
  return { ...parsed, outboundDepart, outboundArrive, returnDepart, returnArrive };
}

function readLog(value: unknown): PriceLog | null {
  if (!value || typeof value !== "object") return null;
  const log = value as Partial<PriceLog>;
  if (typeof log.id !== "string" || log.id.length === 0) return null;
  if (typeof log.routeId !== "string" || log.routeId.length === 0) return null;
  if (!isAirline(log.airline)) return null;
  if (typeof log.amount !== "number" || !Number.isFinite(log.amount) || log.amount <= 0) return null;
  if (log.currency !== "PLN") return null;
  if (typeof log.checkedOn !== "string" || !isIsoDate(log.checkedOn)) return null;
  if (typeof log.createdAt !== "string" || log.createdAt.length === 0) return null;
  const outboundDepart = readOptionalTime(log.outboundDepart);
  const outboundArrive = readOptionalTime(log.outboundArrive);
  const returnDepart = readOptionalTime(log.returnDepart);
  const returnArrive = readOptionalTime(log.returnArrive);
  if (
    outboundDepart === "invalid" ||
    outboundArrive === "invalid" ||
    returnDepart === "invalid" ||
    returnArrive === "invalid"
  ) {
    return null;
  }
  return {
    id: log.id,
    routeId: log.routeId,
    airline: log.airline,
    amount: log.amount,
    currency: "PLN",
    checkedOn: log.checkedOn,
    createdAt: log.createdAt,
    outboundDepart,
    outboundArrive,
    returnDepart,
    returnArrive,
  };
}

function readOptionalTime(value: unknown): string | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "invalid";
  return parseTimeInput(value);
}

export function parseStore(raw: string): StoreData {
  if (raw === "") return { routes: [], logs: [] };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("corrupt");
  const record = parsed as { routes?: unknown; logs?: unknown };
  if (!Array.isArray(record.routes) || !Array.isArray(record.logs)) throw new Error("corrupt");
  const routes = record.routes.map(readRoute);
  const logs = record.logs.map(readLog);
  if (routes.some((route) => route === null) || logs.some((log) => log === null)) {
    throw new Error("corrupt");
  }
  return { routes: routes as WatchedRoute[], logs: logs as PriceLog[] };
}

export type StoreView =
  | { status: "loading" }
  | { status: "error"; kind: "blocked" | "corrupt" }
  | { status: "ready"; data: StoreData };

export function interpretSnapshot(snapshot: string): StoreView {
  if (isLoadingSnapshot(snapshot)) return { status: "loading" };
  if (isBlockedSnapshot(snapshot)) return { status: "error", kind: "blocked" };
  try {
    return { status: "ready", data: parseStore(snapshot) };
  } catch {
    return { status: "error", kind: "corrupt" };
  }
}

function writeRaw(raw: string | null) {
  if (raw === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, raw);
  cachedSnapshot = null;
  emit();
}

export function saveStore(data: StoreData) {
  writeRaw(JSON.stringify(data));
}

export function clearStore() {
  writeRaw(null);
}

export function refreshStore() {
  cachedSnapshot = null;
  emit();
}

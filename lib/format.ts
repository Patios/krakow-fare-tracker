const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
});

export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}

export function formatTripDates(from: string, to: string | null): string {
  if (!to || to === from) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatPln(amount: number): string {
  return moneyFormatter.format(amount);
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
  return roundMoney(amount);
}

export function parseTimeInput(raw: string): string | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return "invalid";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "invalid";
  return `${match[1]}:${match[2]}`;
}

export function formatFlightTimes(times: {
  outboundDepart: string | null;
  outboundArrive: string | null;
  returnDepart: string | null;
  returnArrive: string | null;
}): string | null {
  const outbound = legLabel("wylot", times.outboundDepart, times.outboundArrive);
  const inbound = legLabel("powrót", times.returnDepart, times.returnArrive);
  if (outbound && inbound) return `${outbound} · ${inbound}`;
  return outbound ?? inbound;
}

function legLabel(kind: "wylot" | "powrót", depart: string | null, arrive: string | null): string | null {
  if (depart && arrive) return `${kind} ${depart}–${arrive}`;
  if (depart) return `${kind} ${depart}`;
  if (!arrive) return null;
  return kind === "wylot" ? `przylot ${arrive}` : `przylot powrotny ${arrive}`;
}

export function foldText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pl");
}

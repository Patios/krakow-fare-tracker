"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { lookupDestination } from "@/lib/network-refresh";
import {
  cheapestDay,
  confirmLeg,
  loadRyanairMonth,
  monthGrid,
  monthStart,
  shiftMonth,
  type CalendarDay,
  type MonthRead,
  type PickedLeg,
} from "@/lib/fare-calendar";
import { flightClock, formatDate, formatPln, roundMoney, todayIso } from "@/lib/format";
import { sameTrip } from "@/lib/routes";
import type { WatchedRoute } from "@/lib/types";
import { cn } from "@/lib/utils";

type Leg = "outbound" | "return";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" });

export function FareCalendarDialog({
  route,
  routes,
  onOpenChange,
  onPick,
}: {
  route: WatchedRoute;
  routes: WatchedRoute[];
  onOpenChange: (open: boolean) => void;
  onPick: (outbound: PickedLeg, inbound: PickedLeg | null) => boolean;
}) {
  const today = todayIso();
  const firstMonth = monthStart(today);
  const destination = lookupDestination(route.destinationIata);
  const city = destination?.city ?? route.destinationIata;
  const hasReturn = route.returnDate != null;
  const rangeEnd = route.outboundTo ?? route.outboundFrom;

  const [leg, setLeg] = useState<Leg>("outbound");
  const [months, setMonths] = useState<Record<Leg, string>>({
    outbound: laterMonth(monthStart(route.outboundFrom), firstMonth),
    return: laterMonth(monthStart(route.returnDate ?? route.outboundFrom), firstMonth),
  });
  const [reads, setReads] = useState<Record<string, MonthRead>>({});
  const [picked, setPicked] = useState<Record<Leg, CalendarDay | null>>({ outbound: null, return: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const month = months[leg];
  const [origin, arrival] = leg === "outbound" ? ["KRK", route.destinationIata] : [route.destinationIata, "KRK"];
  const readKey = `${leg}:${month}`;
  const read = reads[readKey];
  const earliest = leg === "return" && picked.outbound ? picked.outbound.date : today;
  const days = read?.ok ? read.days : [];
  const byDate = new Map(days.map((day) => [day.date, day]));
  const best = cheapestDay(days, earliest);

  useEffect(() => {
    if (reads[readKey]) return;
    const controller = new AbortController();
    loadRyanairMonth(origin, arrival, month, fetch, controller.signal)
      .then((result) => setReads((current) => ({ ...current, [readKey]: result })))
      .catch(() => {});
    return () => controller.abort();
  }, [readKey, origin, arrival, month, reads]);

  function savedRange(date: string) {
    if (leg === "outbound") return date >= route.outboundFrom && date <= rangeEnd;
    return date === route.returnDate;
  }

  function choose(day: CalendarDay) {
    setError("");
    if (leg === "outbound") {
      const keepReturn = picked.return && picked.return.date >= day.date ? picked.return : null;
      setPicked({ outbound: day, return: keepReturn });
      if (hasReturn) {
        setLeg("return");
        if (!keepReturn && months.return < monthStart(day.date)) {
          setMonths((current) => ({ ...current, return: monthStart(day.date) }));
        }
      }
    } else {
      setPicked((current) => ({ ...current, return: day }));
    }
  }

  async function confirm() {
    const outboundDay = picked.outbound;
    const returnDay = picked.return;
    if (!outboundDay || (hasReturn && !returnDay)) return;
    const trip = {
      destinationIata: route.destinationIata,
      outboundFrom: outboundDay.date,
      outboundTo: null,
      returnDate: returnDay?.date ?? null,
    };
    if (routes.some((existing) => existing.id !== route.id && sameTrip(existing, trip))) {
      setError("Trasa z tymi datami jest już na liście.");
      return;
    }
    setSaving(true);
    setError("");
    const [outbound, inbound] = await Promise.all([
      confirmLeg("KRK", route.destinationIata, outboundDay),
      returnDay ? confirmLeg(route.destinationIata, "KRK", returnDay) : Promise.resolve(null),
    ]);
    setSaving(false);
    if (!outbound || (returnDay && !inbound)) {
      setError("Nie udało się potwierdzić lotu. Spróbuj ponownie.");
      return;
    }
    if (!onPick(outbound, inbound)) {
      setError("Nie udało się zapisać w tej przeglądarce.");
      return;
    }
    onOpenChange(false);
  }

  const total =
    picked.outbound?.amount != null && (!hasReturn || picked.return?.amount != null)
      ? roundMoney(picked.outbound.amount + (picked.return?.amount ?? 0))
      : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl!">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Kalendarz cen · KRK → {route.destinationIata}</DialogTitle>
          <DialogDescription>
            {city}: najtańszy lot Ryanair w każdym dniu, za bilet w jedną stronę bez bagażu. Dni z zapisanej trasy
            są obrysowane. Wybrany lot ustawi datę i godziny trasy oraz zapisze cenę w historii.
          </DialogDescription>
        </DialogHeader>

        {hasReturn ? (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Kierunek">
            <Button
              type="button"
              variant={leg === "outbound" ? "default" : "outline"}
              aria-pressed={leg === "outbound"}
              onClick={() => setLeg("outbound")}
            >
              1. Wylot{picked.outbound ? ` · ${formatDate(picked.outbound.date)}` : ""}
            </Button>
            <Button
              type="button"
              variant={leg === "return" ? "default" : "outline"}
              aria-pressed={leg === "return"}
              onClick={() => setLeg("return")}
              disabled={!picked.outbound}
            >
              2. Powrót{picked.return ? ` · ${formatDate(picked.return.date)}` : ""}
            </Button>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Poprzedni miesiąc"
            disabled={month <= laterMonth(firstMonth, monthStart(earliest))}
            onClick={() => setMonths((current) => ({ ...current, [leg]: shiftMonth(month, -1) }))}
          >
            <ChevronLeft />
          </Button>
          <p className="font-heading text-base font-semibold capitalize" aria-live="polite">
            {leg === "outbound" ? `Wylot KRK → ${route.destinationIata}` : `Powrót ${route.destinationIata} → KRK`} ·{" "}
            {monthFormatter.format(new Date(`${month}T00:00:00Z`))}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Następny miesiąc"
            disabled={month >= shiftMonth(firstMonth, 12)}
            onClick={() => setMonths((current) => ({ ...current, [leg]: shiftMonth(month, 1) }))}
          >
            <ChevronRight />
          </Button>
        </div>

        {!read ? (
          <p className="text-sm text-muted-foreground" role="status">
            Wczytuję ceny z Ryanair…
          </p>
        ) : !read.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {read.reason === "blocked"
              ? "Przeglądarka nie dostała odpowiedzi od Ryanair."
              : "Nie udało się odczytać cen z Ryanair."}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() =>
                setReads((current) => {
                  const next = { ...current };
                  delete next[readKey];
                  return next;
                })
              }
            >
              Spróbuj ponownie
            </button>
          </p>
        ) : (
          <div className="grid gap-1">
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid(month).map((date, index) => {
                if (!date) return <span key={`pad-${index}`} />;
                const day = byDate.get(date);
                const selectable = day?.status === "fare" && date >= earliest;
                const selected = picked[leg]?.date === date;
                const cheapest = best?.date === date;
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!selectable}
                    aria-pressed={selected}
                    aria-label={
                      selectable && day?.amount != null
                        ? `${formatDate(date)}, ${formatPln(day.amount)}${day.departs ? `, wylot ${day.departs}` : ""}`
                        : `${formatDate(date)}, brak lotu`
                    }
                    onClick={() => day && choose(day)}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-sm ring-1 ring-foreground/10 transition-colors",
                      selectable ? "bg-card hover:bg-muted" : "cursor-not-allowed opacity-40",
                      savedRange(date) && "ring-2 ring-ryanair-yellow",
                      cheapest && !selected && "bg-emerald-700/15",
                      selected && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    <span className="text-xs">{Number(date.slice(8))}</span>
                    {selectable && day?.amount != null ? (
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums sm:text-sm",
                          cheapest && !selected && "text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {Math.round(day.amount)} zł
                      </span>
                    ) : (
                      <span className="text-xs">{day?.status === "sold-out" ? "brak" : "–"}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {best?.amount != null
                ? `Najtaniej w tym miesiącu: ${formatDate(best.date)}, ${formatPln(best.amount)} (zielone pole).`
                : "W tym miesiącu Ryanair nie sprzedaje biletów na tę trasę."}
            </p>
          </div>
        )}

        {picked.outbound ? (
          <dl className="grid gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
            <PickedRow label="Wylot" day={picked.outbound} />
            {hasReturn ? (
              picked.return ? (
                <PickedRow label="Powrót" day={picked.return} />
              ) : (
                <p className="text-muted-foreground">Wybierz dzień powrotu.</p>
              )
            ) : null}
            {total != null && hasReturn ? (
              <div className="flex justify-between font-semibold">
                <dt>Razem</dt>
                <dd className="tabular-nums">{formatPln(total)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={total == null || saving}>
            {saving ? "Zapisuję…" : "Wybierz ten lot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickedRow({ label, day }: { label: string; day: CalendarDay }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>
        {label}: {formatDate(day.date)}
        {flightClock(day.departs, day.arrives) ? ` · ${flightClock(day.departs, day.arrives)}` : ""}
      </dt>
      <dd className="tabular-nums">{day.amount != null ? formatPln(day.amount) : ""}</dd>
    </div>
  );
}

function laterMonth(a: string, b: string) {
  return a > b ? a : b;
}

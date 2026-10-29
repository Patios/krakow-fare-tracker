"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, History, Pencil, PlaneLanding, PlaneTakeoff, RefreshCw, Trash2 } from "lucide-react";
import { formatAutoFlights, noFareText, type DayFlights, type NoFare, type RyanairFare } from "@/lib/fare-refresh";
import { AirlineChip, AirlineMark } from "@/components/airline-mark";
import { FlightDayCheck } from "@/components/flight-day-check";
import { AIRLINE_LABEL } from "@/lib/airports";
import { lookupDestination } from "@/lib/network-refresh";
import { flightClock, formatDate, formatFlightTimes, formatPln, formatTripDates, todayIso } from "@/lib/format";
import { latestLogsByAirline, lowestLoggedPrice, orderedLogs, priceDrop } from "@/lib/routes";
import { openAirlineWindow } from "@/lib/airline-window";
import { ryanairSearchUrl, wizzairSearchUrl, wizzRangeNote } from "@/lib/search-urls";
import type { Airline, PriceLog, WatchedRoute } from "@/lib/types";
import type { WizzEstimateLeg } from "@/lib/wizz-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RouteCard({
  id,
  route,
  logs,
  onLogPrice,
  onEdit,
  onCheck,
  onDeleteRoute,
  onDeleteLog,
  refreshing,
  refreshNote,
  noFare,
  dayFlights,
  wizzPriced,
  wizzEstimate,
  onRefresh,
  onCalendar,
  autoRefresh,
  autoIntervalHours,
  checkedNote,
  onToggleAuto,
}: {
  id?: string;
  route: WatchedRoute;
  logs: PriceLog[];
  onLogPrice: () => void;
  onEdit: () => void;
  refreshing: boolean;
  refreshNote: string | null;
  noFare: NoFare | null;
  dayFlights: DayFlights[];
  wizzPriced: boolean;
  wizzEstimate: { amount: number; legs: WizzEstimateLeg[] } | null;
  onRefresh: () => void;
  onCalendar: () => void;
  autoRefresh: boolean;
  autoIntervalHours: number;
  checkedNote: string | null;
  onToggleAuto: (enabled: boolean) => void;
  onCheck: (check: { airline: Airline; href: string; blocked: boolean }) => void;
  onDeleteRoute: () => void;
  onDeleteLog: (logId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const destination = lookupDestination(route.destinationIata);
  const routeLogs = orderedLogs(logs, route.id);
  const lowest = lowestLoggedPrice(routeLogs);
  const latest = routeLogs[0];
  const drop = priceDrop(routeLogs);
  const airlineOffers =
    destination && destination.airlines.length > 1 ? latestLogsByAirline(routeLogs, destination.airlines) : null;
  const outboundClock =
    flightClock(route.outboundDepart ?? null, route.outboundArrive ?? null) ??
    firstClock(routeLogs, "outboundDepart", "outboundArrive");
  const returnClock = route.returnDate
    ? flightClock(route.returnDepart ?? null, route.returnArrive ?? null) ??
      firstClock(routeLogs, "returnDepart", "returnArrive")
    : null;
  const sharedClocks = !airlineOffers || !airlineOffers.some((offer) => offer.log && formatFlightTimes(offer.log));
  const past = route.outboundFrom < todayIso();
  const servedByRyanair = destination?.airlines.includes("ryanair") ?? false;
  const refreshable = servedByRyanair || wizzPriced;
  const hasRyanairLog = routeLogs.some((log) => log.airline === "ryanair");
  const rangeNote = destination?.airlines.includes("wizzair") ? wizzRangeNote(route) : null;
  const outboundFlights = dayFlights.find((leg) => leg.leg === "outbound") ?? null;
  const returnFlights = dayFlights.find((leg) => leg.leg === "return") ?? null;
  const listsFlights = dayFlights.length > 0;
  const trip = {
    outboundFrom: route.outboundFrom,
    outboundTo: route.outboundTo,
    returnDate: route.returnDate,
  };

  const links = destination
    ? destination.airlines.map((airline) => {
        const href = airline === "ryanair" ? ryanairSearchUrl(trip, destination.iata) : wizzairSearchUrl(trip, destination.iata);
        return { airline, href, label: AIRLINE_LABEL[airline] };
      })
    : [];

  const notices: { key: string; tone: "warn" | "info" | "good"; text: string }[] = [];
  if (noFare && !refreshNote) {
    notices.push({
      key: "no-fare",
      tone: "warn",
      text: `${noFareText(route.destinationIata, noFare)}${hasRyanairLog ? " Cena Ryanair na karcie pochodzi z wcześniejszego wpisu." : ""}`,
    });
  }
  if (refreshNote) notices.push({ key: "refresh", tone: "info", text: refreshNote });
  if (drop) {
    notices.push({
      key: "drop",
      tone: "good",
      text: `Ostatni wpis jest niższy niż poprzedni (${formatPln(drop.previous.amount)}, ${AIRLINE_LABEL[drop.previous.airline]}, ${formatDate(drop.previous.checkedOn)}).`,
    });
  }
  if (past) notices.push({ key: "past", tone: "info", text: "Data wylotu już minęła. Wyszukiwarka linii może jej nie pokazać." });
  if (rangeNote) notices.push({ key: "range", tone: "info", text: rangeNote });

  return (
    <Card id={id} className={cn("scroll-mt-4 gap-0 pt-0 pb-0", drop && "ring-emerald-700/30")}>
      <div aria-hidden className={cn("h-1.5 w-full", airlineStripe(destination?.airlines))} />
      <CardHeader className="pt-4 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="font-heading text-xs font-semibold tracking-[0.16em] text-brand-ink uppercase">
              KRK → {route.destinationIata}
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-wide">
              {destination?.city ?? route.destinationIata}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
              <span>
                {destination ? `${destination.airport} · ${destination.country}` : "Tego lotniska nie ma w zimowym rozkładzie."}
              </span>
              {destination?.airlines.map((airline) => <AirlineChip key={airline} airline={airline} />)}
            </div>
          </div>
          {airlineOffers ? null : !latest && wizzEstimate ? (
            <div className="text-right">
              <WizzEstimate estimate={wizzEstimate} named />
            </div>
          ) : (
            <PriceSummary lowest={lowest} latest={latest} drop={drop?.delta ?? null} />
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 pb-4">
        {airlineOffers ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {airlineOffers.map((offer) => {
              const times = offer.log ? formatFlightTimes(offer.log) : null;
              return (
                <li key={offer.airline} className="grid content-start gap-0.5 rounded-xl border px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <AirlineMark airline={offer.airline} className="size-5" />
                    {AIRLINE_LABEL[offer.airline]}
                  </p>
                  {offer.log ? (
                    <>
                      <p className="font-heading text-3xl font-bold tracking-wide text-brand-ink tabular-nums dark:text-ryanair-yellow">
                        {formatPln(offer.log.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(offer.log.checkedOn)}
                        {times ? ` · ${times}` : ""}
                      </p>
                      {!(offer.airline === "ryanair" && listsFlights) ? <AutoSource log={offer.log} /> : null}
                    </>
                  ) : offer.airline === "wizzair" && wizzEstimate ? (
                    <WizzEstimate estimate={wizzEstimate} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {offer.airline === "ryanair" || wizzPriced
                        ? "Brak ceny. Pobierz ją przyciskiem „Odśwież cenę”."
                        : "Brak ceny. Po sprawdzeniu u linii wpisz kwotę."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="grid overflow-hidden rounded-xl border sm:grid-cols-2">
          <Leg
            icon={<PlaneTakeoff />}
            title={`Wylot · KRK → ${route.destinationIata}`}
            date={formatTripDates(route.outboundFrom, route.outboundTo)}
            clock={sharedClocks ? outboundClock : null}
            flights={outboundFlights?.flights ?? null}
            missing={noFare?.missing.some((leg) => leg.leg === "outbound") ?? false}
            wizz={wizzEstimate?.legs.find((leg) => leg.leg === "outbound") ?? null}
          />
          <Leg
            icon={<PlaneLanding />}
            title={route.returnDate ? `Powrót · ${route.destinationIata} → KRK` : "Powrót"}
            date={route.returnDate ? formatDate(route.returnDate) : "W jedną stronę"}
            clock={sharedClocks ? returnClock : null}
            flights={returnFlights?.flights ?? null}
            missing={noFare?.missing.some((leg) => leg.leg === "return") ?? false}
            wizz={wizzEstimate?.legs.find((leg) => leg.leg === "return") ?? null}
            className="border-t sm:border-t-0 sm:border-l"
          />
        </div>

        {!airlineOffers && latest && !(latest.airline === "ryanair" && listsFlights) ? <AutoSource log={latest} /> : null}

        {notices.length > 0 ? (
          <div className="grid gap-2" role="status">
            {notices.map((notice) => (
              <p
                key={notice.key}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  notice.tone === "warn" && "border border-amber-500/40 bg-amber-500/10",
                  notice.tone === "good" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                  notice.tone === "info" && "bg-muted/60 text-muted-foreground",
                )}
              >
                {notice.text}
              </p>
            ))}
          </div>
        ) : null}

        {destination ? (
          <FlightDayCheck
            trip={{
              destinationIata: route.destinationIata,
              outboundFrom: route.outboundFrom,
              outboundTo: route.outboundTo,
              returnDate: route.returnDate,
            }}
            airlines={destination.airlines}
            buttonClassName="h-8"
          />
        ) : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t py-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {links.map((link) => (
            <Button
              key={link.airline}
              type="button"
              className={cn(
                "col-span-2 h-9 gap-2 px-3 font-semibold",
                link.airline === "ryanair"
                  ? "bg-ryanair-yellow text-ryanair hover:bg-ryanair-yellow/90"
                  : "bg-wizz text-white hover:bg-wizz/90",
              )}
              onClick={() => {
                const opened = openAirlineWindow(link.href, link.airline);
                onCheck({ airline: link.airline, href: link.href, blocked: !opened });
              }}
            >
              <AirlineMark airline={link.airline} variant="glyph" />
              Sprawdź dziś · {link.label}
            </Button>
          ))}
          {refreshable ? (
            <Button type="button" variant="outline" className="h-9" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Pobieram…" : "Odśwież cenę"}
            </Button>
          ) : null}
          {servedByRyanair ? (
            <Button type="button" variant="outline" className="h-9" onClick={onCalendar}>
              <CalendarDays /> Kalendarz cen
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="col-span-2 h-9" onClick={onLogPrice} disabled={!destination}>
            Zapisz cenę
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          {refreshable ? (
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => onToggleAuto(event.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="grid">
                Odświeżaj automatycznie co {autoIntervalHours} h
                {checkedNote ? <span className="text-xs">{checkedNote}</span> : null}
              </span>
            </label>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <History /> Historia ({routeLogs.length})
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              <Pencil /> Edytuj
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDeleteRoute}>
              <Trash2 /> Usuń
            </Button>
          </div>
        </div>
      </CardFooter>

      {historyOpen ? (
        <div className="border-t px-4 py-4">
          {routeLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nie ma jeszcze wpisów.</p>
          ) : (
            <ul className="grid gap-2">
              {routeLogs.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-lg bg-muted/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="font-medium tabular-nums">{formatPln(entry.amount)}</span>
                      <AirlineMark airline={entry.airline} className="size-5" />
                      <span className="text-muted-foreground">
                        {AIRLINE_LABEL[entry.airline]} · {formatDate(entry.checkedOn)}
                        {formatFlightTimes(entry) ? ` · ${formatFlightTimes(entry)}` : ""}
                      </span>
                    </span>
                    <AutoSource log={entry} />
                  </span>
                  {pendingLogId === entry.id ? (
                    <span className="flex gap-2">
                      <Button type="button" size="sm" variant="destructive" onClick={() => onDeleteLog(entry.id)}>
                        Usuń wpis
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPendingLogId(null)}>
                        Zostaw
                      </Button>
                    </span>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingLogId(entry.id)}>
                      Usuń wpis
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function PriceSummary({ lowest, latest, drop }: { lowest: number | null; latest: PriceLog | undefined; drop: number | null }) {
  if (lowest == null || !latest) {
    return (
      <div className="text-left sm:text-right">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">Cena</p>
        <p className="text-sm text-muted-foreground">Brak wpisu</p>
      </div>
    );
  }
  return (
    <div className="grid justify-items-start gap-0.5 sm:justify-items-end sm:text-right">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">Najniższa zapisana</p>
      <p className="font-heading text-4xl leading-none font-bold tracking-wide text-brand-ink tabular-nums dark:text-ryanair-yellow">
        {formatPln(lowest)}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <AirlineMark airline={latest.airline} className="size-4" />
        <span>
          Ostatnio <span className="font-medium text-foreground tabular-nums">{formatPln(latest.amount)}</span> ·{" "}
          {formatDate(latest.checkedOn)}
        </span>
      </p>
      {drop ? <Badge className="mt-1 bg-emerald-800 text-white">Taniej o {formatPln(drop)}</Badge> : null}
    </div>
  );
}

function Leg({
  icon,
  title,
  date,
  clock,
  flights,
  missing,
  wizz,
  className,
}: {
  icon: ReactNode;
  title: string;
  date: string;
  clock: string | null;
  flights: RyanairFare[] | null;
  missing: boolean;
  wizz: WizzEstimateLeg | null;
  className?: string;
}) {
  const byTime = flights ? [...flights].sort((a, b) => (a.departs ?? "").localeCompare(b.departs ?? "")) : [];
  const cheapest = flights?.[0] ?? null;
  return (
    <div className={cn("grid content-start gap-1 px-3 py-2.5", className)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {title}
      </p>
      <p className="font-medium">
        {date}
        {clock && byTime.length === 0 ? <span className="tabular-nums text-muted-foreground"> · {clock}</span> : null}
      </p>
      {missing ? (
        <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-sm text-amber-800 dark:text-amber-300">
          Ryanair nie sprzedaje lotu w tym terminie
        </p>
      ) : null}
      {byTime.length > 0 ? (
        <ul className="mt-1 grid gap-1 text-sm">
          {byTime.map((flight) => {
            const best = flight === cheapest && byTime.length > 1;
            return (
              <li
                key={`${flight.number}-${flight.departs}`}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-2 py-1 tabular-nums",
                  best ? "bg-ryanair-yellow/15 ring-1 ring-ryanair-yellow/40" : "bg-muted/50",
                )}
              >
                <span>
                  <span className="font-medium">{flightClock(flight.departs, flight.arrives) ?? "—"}</span>
                  <span className="text-muted-foreground"> · {flight.number || "FR"}</span>
                </span>
                <span className="flex items-center gap-2">
                  {best ? <span className="text-[0.7rem] font-semibold tracking-wide uppercase">najtaniej</span> : null}
                  <span className={cn(best && "font-semibold")}>{formatPln(flight.amount)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {wizz ? (
        <p className="mt-1 flex items-center justify-between gap-3 rounded-md bg-wizz/10 px-2 py-1 text-sm tabular-nums">
          <span>
            <span className="font-medium">{wizz.departs ?? "—"}</span>
            <span className="text-muted-foreground"> · Wizz Air · {formatDate(wizz.date)}</span>
          </span>
          <span className={cn(wizz.approximate && "italic")}>
            {wizz.approximate ? "ok. " : ""}
            {formatPln(wizz.amount)}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function WizzEstimate({ estimate, named = false }: { estimate: { amount: number; legs: WizzEstimateLeg[] }; named?: boolean }) {
  return (
    <>
      <p className="text-xs text-muted-foreground">{named ? "Wizz Air · orientacyjnie" : "Orientacyjnie"}</p>
      <p className="font-heading text-3xl font-bold tracking-wide text-wizz tabular-nums">
        ok. {formatPln(estimate.amount)}
      </p>
      {estimate.legs.length > 1 ? (
        <p className="text-xs tabular-nums">
          {estimate.legs
            .map((leg) => `${leg.leg === "outbound" ? "wylot" : "powrót"} ${leg.approximate ? "ok. " : ""}${formatPln(leg.amount)}`)
            .join(" + ")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Kalendarz Wizz nie podaje dokładnej ceny. Aktualną zobaczysz w „Sprawdź dziś · Wizz Air”.
      </p>
    </>
  );
}

function AutoSource({ log }: { log: PriceLog }) {
  if (!log.autoFlights) {
    return <span className="mt-0.5 block text-xs text-muted-foreground">Wpisane ręcznie</span>;
  }
  const flights = formatAutoFlights(log.autoFlights);
  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {log.airline === "wizzair" ? "Z rozkładu Wizz Air" : "Pobrane z Ryanair"}
      {flights ? ` · ${flights}` : ""}
    </span>
  );
}

function firstClock(
  logs: PriceLog[],
  depart: "outboundDepart" | "returnDepart",
  arrive: "outboundArrive" | "returnArrive",
): string | null {
  for (const log of logs) {
    const clock = flightClock(log[depart], log[arrive]);
    if (clock) return clock;
  }
  return null;
}

function airlineStripe(airlines: Airline[] | undefined) {
  if (!airlines || airlines.length === 0) return "bg-border";
  if (airlines.length > 1) return "bg-linear-to-r from-ryanair-yellow to-wizz";
  return airlines[0] === "wizzair" ? "bg-wizz" : "bg-ryanair-yellow";
}

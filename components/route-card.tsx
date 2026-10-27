"use client";

import { useState } from "react";
import { AirlineChip, AirlineMark } from "@/components/airline-mark";
import { AIRLINE_LABEL, destinationByIata } from "@/lib/airports";
import { formatDate, formatFlightTimes, formatPln, formatTripDates, todayIso } from "@/lib/format";
import { lowestLoggedPrice, orderedLogs, priceDrop } from "@/lib/routes";
import { openAirlineWindow } from "@/lib/airline-window";
import { ryanairSearchUrl, wizzairSearchUrl, wizzRangeNote } from "@/lib/search-urls";
import type { Airline, PriceLog, WatchedRoute } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RouteCard({
  route,
  logs,
  onLogPrice,
  onCheck,
  onDeleteRoute,
  onDeleteLog,
}: {
  route: WatchedRoute;
  logs: PriceLog[];
  onLogPrice: () => void;
  onCheck: (check: { airline: Airline; href: string; blocked: boolean }) => void;
  onDeleteRoute: () => void;
  onDeleteLog: (logId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const destination = destinationByIata.get(route.destinationIata);
  const routeLogs = orderedLogs(logs, route.id);
  const lowest = lowestLoggedPrice(routeLogs);
  const latest = routeLogs[0];
  const drop = priceDrop(routeLogs);
  const past = route.outboundFrom < todayIso();
  const rangeNote = destination?.airlines.includes("wizzair") ? wizzRangeNote(route) : null;
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

  return (
    <Card className={cn("pt-0", drop && "ring-emerald-700/30")}>
      <div aria-hidden className={cn("h-1.5 w-full", airlineStripe(destination?.airlines))} />
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-semibold tracking-[0.16em] text-brand-ink uppercase">
              KRK → {route.destinationIata}
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-wide">
              {destination?.city ?? route.destinationIata}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {destination
                ? `${destination.airport} · ${destination.country}`
                : "Tego lotniska nie ma w zimowym rozkładzie."}
            </p>
          </div>
          {drop ? (
            <Badge className="bg-emerald-800 text-white">Taniej o {formatPln(drop.delta)}</Badge>
          ) : null}
        </div>
        {destination ? (
          <div className="flex flex-wrap gap-1.5">
            {destination.airlines.map((airline) => (
              <AirlineChip key={airline} airline={airline} />
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Wylot</dt>
            <dd className="font-medium">{formatTripDates(route.outboundFrom, route.outboundTo)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Powrót</dt>
            <dd className="font-medium">{route.returnDate ? formatDate(route.returnDate) : "W jedną stronę"}</dd>
          </div>
        </dl>

        {lowest == null || !latest ? (
          <p className="text-sm text-muted-foreground">Brak zapisanej ceny. Po sprawdzeniu u linii wpisz kwotę.</p>
        ) : (
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Najniższa zapisana</p>
            <p className="font-heading text-4xl font-bold tracking-wide text-brand-ink tabular-nums dark:text-ryanair-yellow">{formatPln(lowest)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span>Ostatnio {formatPln(latest.amount)}</span>
              <AirlineMark airline={latest.airline} className="size-5" />
              <span>
                {AIRLINE_LABEL[latest.airline]} · {formatDate(latest.checkedOn)}
                {formatFlightTimes(latest) ? ` · ${formatFlightTimes(latest)}` : ""}
              </span>
            </p>
            {drop ? (
              <p className="mt-1 text-sm text-emerald-800">
                Ostatni wpis jest niższy niż poprzedni ({formatPln(drop.previous.amount)},{" "}
                {AIRLINE_LABEL[drop.previous.airline]}, {formatDate(drop.previous.checkedOn)}).
              </p>
            ) : null}
          </div>
        )}

        {past ? (
          <p className="text-sm text-muted-foreground">
            Data wylotu już minęła. Wyszukiwarka linii może jej nie pokazać.
          </p>
        ) : null}
        {rangeNote ? <p className="text-sm text-muted-foreground">{rangeNote}</p> : null}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap">
        {links.map((link) => (
          <Button
            key={link.airline}
            type="button"
            className={cn(
              "h-10 gap-2 px-3 font-semibold",
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
        <Button type="button" variant="outline" className="h-10" onClick={onLogPrice} disabled={!destination}>
          Zapisz cenę
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => setHistoryOpen((open) => !open)}>
          Historia ({routeLogs.length})
        </Button>
        <Button type="button" variant="ghost" className="h-10 sm:ml-auto" onClick={onDeleteRoute}>
          Usuń
        </Button>
      </CardFooter>

      {historyOpen ? (
        <div className="px-4 pb-4">
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

function airlineStripe(airlines: Airline[] | undefined) {
  if (!airlines || airlines.length === 0) return "bg-border";
  if (airlines.length > 1) return "bg-linear-to-r from-ryanair-yellow to-wizz";
  return airlines[0] === "wizzair" ? "bg-wizz" : "bg-ryanair-yellow";
}

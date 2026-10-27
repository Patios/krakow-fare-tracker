"use client";

import { useState } from "react";
import { AIRLINE_LABEL, destinationByIata } from "@/lib/airports";
import { formatDate, formatPln, formatTripDates, todayIso } from "@/lib/format";
import { lowestLoggedPrice, orderedLogs, priceDrop } from "@/lib/routes";
import { ryanairSearchUrl, wizzairSearchUrl, wizzRangeNote } from "@/lib/search-urls";
import type { PriceLog, WatchedRoute } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RouteCard({
  route,
  logs,
  onLogPrice,
  onDeleteRoute,
  onDeleteLog,
}: {
  route: WatchedRoute;
  logs: PriceLog[];
  onLogPrice: () => void;
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
    <Card className={cn(drop && "ring-emerald-700/30")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              KRK → {route.destinationIata}
            </p>
            <h2 className="font-heading text-2xl leading-tight font-medium">
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
              <Badge key={airline} variant="outline">
                {AIRLINE_LABEL[airline]}
              </Badge>
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
            <p className="font-heading text-4xl tabular-nums">{formatPln(lowest)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ostatnio {formatPln(latest.amount)} · {AIRLINE_LABEL[latest.airline]} · {formatDate(latest.checkedOn)}
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
          <a
            key={link.airline}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg" }), "h-10 px-3")}
          >
            Sprawdź dziś · {link.label}
          </a>
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
                    <span className="font-medium tabular-nums">{formatPln(entry.amount)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {AIRLINE_LABEL[entry.airline]} · {formatDate(entry.checkedOn)}
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

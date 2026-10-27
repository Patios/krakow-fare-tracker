"use client";

import { useState } from "react";
import { AirlineMark } from "@/components/airline-mark";
import { PriceLogForm } from "@/components/price-log-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AIRLINE_LABEL } from "@/lib/airports";
import { openAirlineWindow } from "@/lib/airline-window";
import { formatDate, formatFlightTimes, formatPln, todayIso } from "@/lib/format";
import { orderedLogs } from "@/lib/routes";
import { wizzRangeNote } from "@/lib/search-urls";
import type { Airline, PriceDraft, PriceLog, WatchedRoute } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CheckFareDialog({
  route,
  city,
  airline,
  href,
  logs,
  popupBlocked,
  onOpenChange,
  onSave,
}: {
  route: WatchedRoute;
  city: string;
  airline: Airline;
  href: string;
  logs: PriceLog[];
  popupBlocked: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: PriceDraft) => boolean;
}) {
  const [blocked, setBlocked] = useState(popupBlocked);
  const [savedAmount, setSavedAmount] = useState<number | null>(null);
  const label = AIRLINE_LABEL[airline];
  const past = route.outboundFrom < todayIso();
  const rangeNote = airline === "wizzair" ? wizzRangeNote(route) : null;
  const history = orderedLogs(logs, route.id);

  function reopen() {
    setBlocked(!openAirlineWindow(href, airline));
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <AirlineMark airline={airline} className="size-6" />
            Sprawdź dziś · {label}
          </DialogTitle>
          <DialogDescription>
            {city}. {label} nie pozwala wstawić swojej strony do tej aplikacji, więc wyszukiwanie jest w
            osobnym oknie przeglądarki. Cenę i godziny lotu, które tam widzisz, wpisz poniżej — trafią od razu
            do historii tej trasy.
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <p role="alert" className="text-sm text-destructive">
            Przeglądarka zablokowała osobne okno. Otwórz je przyciskiem poniżej.
          </p>
        ) : null}
        {past ? (
          <p className="text-sm text-muted-foreground">
            Data wylotu już minęła. Wyszukiwarka linii może jej nie pokazać.
          </p>
        ) : null}
        {rangeNote ? <p className="text-sm text-muted-foreground">{rangeNote}</p> : null}

        <Button
          type="button"
          className={cn(
            "h-10 font-semibold",
            airline === "ryanair" ? "bg-ryanair-yellow text-ryanair hover:bg-ryanair-yellow/90" : "bg-wizz text-white hover:bg-wizz/90",
          )}
          onClick={reopen}
        >
          <AirlineMark airline={airline} variant="glyph" />
          {blocked ? `Otwórz okno ${label}` : `Pokaż okno ${label}`}
        </Button>

        {savedAmount != null ? (
          <p role="status" className="text-sm text-ryanair">
            Zapisano {formatPln(savedAmount)} w historii.
          </p>
        ) : null}

        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Historia tej trasy</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nie ma jeszcze wpisów.</p>
          ) : (
            <ul className="grid gap-1.5">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium tabular-nums">{formatPln(entry.amount)}</span>
                  <AirlineMark airline={entry.airline} className="size-5" />
                  <span className="text-muted-foreground">
                    {AIRLINE_LABEL[entry.airline]} · {formatDate(entry.checkedOn)}
                    {formatFlightTimes(entry) ? ` · ${formatFlightTimes(entry)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <PriceLogForm
          airlines={[airline]}
          hasReturn={route.returnDate != null}
          idPrefix="-check"
          submitLabel="Zapisz w historii"
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
          onSaved={setSavedAmount}
        />
      </DialogContent>
    </Dialog>
  );
}

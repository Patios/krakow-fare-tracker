"use client";

import { useState, type FormEvent } from "react";
import { DestinationPicker } from "@/components/destination-picker";
import { FlightDayCheck } from "@/components/flight-day-check";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker, tripPickerState, type TripDateField } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { lookupDestination } from "@/lib/network-refresh";
import { isIsoDate } from "@/lib/format";
import { normalizeTrip, sameTrip } from "@/lib/routes";
import type { SearchTrip, WatchedRoute } from "@/lib/types";

export function AddRouteDialog({
  open,
  routes,
  initialDestinationIata,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  routes: WatchedRoute[];
  initialDestinationIata?: string;
  onOpenChange: (open: boolean) => void;
  onAdd: (trip: SearchTrip & { destinationIata: string }) => boolean;
}) {
  const [destinationIata, setDestinationIata] = useState(initialDestinationIata ?? "");
  const [mode, setMode] = useState<"day" | "range">("day");
  const [outboundFrom, setOutboundFrom] = useState("");
  const [outboundTo, setOutboundTo] = useState("");
  const [hasReturn, setHasReturn] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [error, setError] = useState("");
  const [openPicker, setOpenPicker] = useState<TripDateField | null>(null);
  const pickerState = tripPickerState(openPicker, setOpenPicker);
  const destination = lookupDestination(destinationIata);
  const specificDay = mode === "day" && isIsoDate(outboundFrom);
  const canCheckFlight = Boolean(destination) && specificDay;
  const flightDisabledReason = !destination
    ? "Wybierz lotnisko i konkretny dzień wylotu, żeby sprawdzić lot."
    : mode === "range"
      ? "Sprawdzenie działa przy konkretnym dniu, nie przy zakresie."
      : "Wybierz konkretny dzień wylotu, żeby sprawdzić lot.";
  const returnDay = hasReturn && isIsoDate(returnDate) && returnDate >= outboundFrom ? returnDate : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!lookupDestination(destinationIata)) {
      setError("Wybierz lotnisko z listy.");
      return;
    }
    if (!isIsoDate(outboundFrom)) {
      setError("Podaj datę wylotu.");
      return;
    }
    if (mode === "range") {
      if (!isIsoDate(outboundTo)) {
        setError("Podaj koniec zakresu.");
        return;
      }
      if (outboundTo < outboundFrom) {
        setError("Koniec zakresu jest wcześniejszy niż początek.");
        return;
      }
    }
    if (hasReturn) {
      if (!isIsoDate(returnDate)) {
        setError("Podaj datę powrotu.");
        return;
      }
      if (returnDate < outboundFrom) {
        setError("Data powrotu jest wcześniejsza niż wylot.");
        return;
      }
    }

    const trip = normalizeTrip({
      outboundFrom,
      outboundTo: mode === "range" ? outboundTo : null,
      returnDate: hasReturn ? returnDate : null,
    });
    const candidate = { destinationIata, ...trip };
    if (routes.some((route) => sameTrip(route, candidate))) {
      setError("Taka trasa jest już na liście.");
      return;
    }

    if (!onAdd(candidate)) {
      setError("Nie udało się zapisać trasy w tej przeglądarce.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg!">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Nowa trasa z Krakowa</DialogTitle>
            <DialogDescription>
              Wylot zawsze z KRK. Wybierz lotnisko, jeden dzień albo zakres, i opcjonalny powrót.
            </DialogDescription>
          </DialogHeader>

          <DestinationPicker value={destinationIata} onChange={setDestinationIata} />

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Wylot</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Rodzaj daty wylotu">
              <Button
                type="button"
                variant={mode === "day" ? "default" : "outline"}
                aria-pressed={mode === "day"}
                onClick={() => setMode("day")}
              >
                Konkretny dzień
              </Button>
              <Button
                type="button"
                variant={mode === "range" ? "default" : "outline"}
                aria-pressed={mode === "range"}
                onClick={() => setMode("range")}
              >
                Zakres dat
              </Button>
            </div>
            <div className={mode === "range" ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
              <div className="grid gap-1.5">
                <Label htmlFor="outbound-from">{mode === "range" ? "Od" : "Data wylotu"}</Label>
                <DatePicker
                  id="outbound-from"
                  value={outboundFrom}
                  onChange={(value) => {
                    setOutboundFrom(value);
                    if (outboundTo && outboundTo < value) setOutboundTo("");
                    if (mode === "range") setOpenPicker("to");
                  }}
                  {...pickerState("from")}
                />
              </div>
              {mode === "range" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="outbound-to">Do</Label>
                  <DatePicker
                    id="outbound-to"
                    value={outboundTo}
                    onChange={setOutboundTo}
                    min={outboundFrom || undefined}
                    {...pickerState("to")}
                  />
                </div>
              ) : null}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={hasReturn}
                onChange={(event) => setHasReturn(event.target.checked)}
                className="size-4 accent-primary"
              />
              Lot powrotny
            </label>
            {hasReturn ? (
              <div className="grid gap-1.5">
                <Label htmlFor="return-date">Data powrotu</Label>
                <DatePicker
                  id="return-date"
                  value={returnDate}
                  onChange={setReturnDate}
                  min={outboundFrom || undefined}
                  {...pickerState("return")}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Bez powrotu link otworzy lot w jedną stronę.</p>
            )}
          </div>

          <FlightDayCheck
            trip={{
              destinationIata,
              outboundFrom,
              outboundTo: null,
              returnDate: returnDay,
            }}
            airlines={destination?.airlines ?? []}
            enabled={canCheckFlight}
            disabledReason={canCheckFlight ? undefined : flightDisabledReason}
            searchHint={false}
          />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit">Dodaj trasę</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

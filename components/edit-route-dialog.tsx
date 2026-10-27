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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { destinationByIata } from "@/lib/airports";
import { flightClock, isIsoDate, parseTimeInput } from "@/lib/format";
import { normalizeTrip, orderedLogs, sameTrip } from "@/lib/routes";
import type { PriceLog, WatchedRoute } from "@/lib/types";

export function EditRouteDialog({
  route,
  routes,
  logs,
  onOpenChange,
  onSave,
}: {
  route: WatchedRoute;
  routes: WatchedRoute[];
  logs: PriceLog[];
  onOpenChange: (open: boolean) => void;
  onSave: (route: WatchedRoute) => boolean;
}) {
  const initialOutbound = prefilledLeg(route, logs, "outboundDepart", "outboundArrive");
  const initialReturn = prefilledLeg(route, logs, "returnDepart", "returnArrive");
  const [destinationIata, setDestinationIata] = useState(route.destinationIata);
  const [mode, setMode] = useState<"day" | "range">(route.outboundTo ? "range" : "day");
  const [outboundFrom, setOutboundFrom] = useState(route.outboundFrom);
  const [outboundTo, setOutboundTo] = useState(route.outboundTo ?? "");
  const [hasReturn, setHasReturn] = useState(route.returnDate != null);
  const [returnDate, setReturnDate] = useState(route.returnDate ?? "");
  const [outboundDepart, setOutboundDepart] = useState(initialOutbound.depart);
  const [outboundArrive, setOutboundArrive] = useState(initialOutbound.arrive);
  const [returnDepart, setReturnDepart] = useState(initialReturn.depart);
  const [returnArrive, setReturnArrive] = useState(initialReturn.arrive);
  const [error, setError] = useState("");
  const destination = destinationByIata.get(destinationIata);
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
    if (!destinationByIata.has(destinationIata)) {
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

    const outboundDepartTime = parseTimeInput(outboundDepart);
    const outboundArriveTime = parseTimeInput(outboundArrive);
    const returnDepartTime = hasReturn ? parseTimeInput(returnDepart) : null;
    const returnArriveTime = hasReturn ? parseTimeInput(returnArrive) : null;
    if (
      outboundDepartTime === "invalid" ||
      outboundArriveTime === "invalid" ||
      returnDepartTime === "invalid" ||
      returnArriveTime === "invalid"
    ) {
      setError("Godzina ma mieć postać GG:MM.");
      return;
    }

    const trip = normalizeTrip({
      outboundFrom,
      outboundTo: mode === "range" ? outboundTo : null,
      returnDate: hasReturn ? returnDate : null,
    });
    const candidate = { destinationIata, ...trip };
    if (routes.some((existing) => existing.id !== route.id && sameTrip(existing, candidate))) {
      setError("Taka trasa jest już na liście.");
      return;
    }

    const saved = onSave({
      ...route,
      ...candidate,
      outboundDepart: outboundDepartTime,
      outboundArrive: outboundArriveTime,
      returnDepart: returnDepartTime,
      returnArrive: returnArriveTime,
    });
    if (!saved) {
      setError("Nie udało się zapisać trasy w tej przeglądarce.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg!">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Edytuj trasę</DialogTitle>
            <DialogDescription>
              Uzupełnij albo zmień lotnisko, daty i godziny. Historia cen zostaje przy tej trasie.
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
                <Label htmlFor="edit-outbound-from">{mode === "range" ? "Od" : "Data wylotu"}</Label>
                <Input
                  id="edit-outbound-from"
                  type="date"
                  value={outboundFrom}
                  onChange={(event) => setOutboundFrom(event.target.value)}
                  className="h-10"
                  required
                />
              </div>
              {mode === "range" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-outbound-to">Do</Label>
                  <Input
                    id="edit-outbound-to"
                    type="date"
                    value={outboundTo}
                    onChange={(event) => setOutboundTo(event.target.value)}
                    min={outboundFrom || undefined}
                    className="h-10"
                    required
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
                <Label htmlFor="edit-return-date">Data powrotu</Label>
                <Input
                  id="edit-return-date"
                  type="date"
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  min={outboundFrom || undefined}
                  className="h-10"
                  required
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Bez powrotu link otworzy lot w jedną stronę.</p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Godziny lotu</legend>
            <p className="text-sm text-muted-foreground">Puste pole zostaje puste. Godzina przy dacie na karcie bierze się stąd.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <TimeField id="edit-outbound-depart" label="Wylot z KRK" value={outboundDepart} onChange={setOutboundDepart} />
              <TimeField id="edit-outbound-arrive" label="Przylot" value={outboundArrive} onChange={setOutboundArrive} />
            </div>
            {hasReturn ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <TimeField id="edit-return-depart" label="Wylot powrotny" value={returnDepart} onChange={setReturnDepart} />
                <TimeField id="edit-return-arrive" label="Przylot do KRK" value={returnArrive} onChange={setReturnArrive} />
              </div>
            ) : null}
          </fieldset>

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
            <Button type="submit">Zapisz zmiany</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function prefilledLeg(
  route: WatchedRoute,
  logs: PriceLog[],
  depart: "outboundDepart" | "returnDepart",
  arrive: "outboundArrive" | "returnArrive",
) {
  if (flightClock(route[depart] ?? null, route[arrive] ?? null)) {
    return { depart: route[depart] ?? "", arrive: route[arrive] ?? "" };
  }
  const log = orderedLogs(logs, route.id).find((entry) => flightClock(entry[depart], entry[arrive]));
  return { depart: log?.[depart] ?? "", arrive: log?.[arrive] ?? "" };
}

function TimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} className="h-10" />
    </div>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { AirlineMark } from "@/components/airline-mark";
import { DatePicker, tripPickerState, type TripDateField } from "@/components/date-picker";
import { DestinationPicker } from "@/components/destination-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AIRLINE_LABEL } from "@/lib/airports";
import { normalizeFlightNumber, type Booking, type BookingDraft, type BookingLeg } from "@/lib/bookings";
import { loadDay, type DaySchedule } from "@/lib/flight-schedule";
import { flightClock, formatDate, isIsoDate, parseAmount, parseTimeInput } from "@/lib/format";
import { lookupDestination } from "@/lib/network-refresh";
import type { Airline } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getWizzServerSnapshot, getWizzSnapshot, subscribeWizz } from "@/lib/wizz-data";

type LegFields = { date: string; flightNumber: string; depart: string; arrive: string };

const emptyLeg: LegFields = { date: "", flightNumber: "", depart: "", arrive: "" };

function legFields(leg: BookingLeg | null | undefined): LegFields {
  if (!leg) return emptyLeg;
  return { date: leg.date, flightNumber: leg.flightNumber ?? "", depart: leg.depart ?? "", arrive: leg.arrive ?? "" };
}

export function BookingDialog({
  open,
  booking,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** Set when editing. */
  booking: Booking | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: BookingDraft) => void;
}) {
  const [destinationIata, setDestinationIata] = useState(booking?.destinationIata ?? "");
  const [airline, setAirline] = useState<Airline | null>(booking?.airline ?? null);
  const [hasOutbound, setHasOutbound] = useState(booking ? booking.outbound != null : true);
  const [outbound, setOutbound] = useState<LegFields>(legFields(booking?.outbound));
  const [hasReturn, setHasReturn] = useState(booking?.return != null);
  const [inbound, setInbound] = useState<LegFields>(legFields(booking?.return));
  const [reference, setReference] = useState(booking?.reference ?? "");
  const [paid, setPaid] = useState(booking?.paid != null ? String(booking.paid).replace(".", ",") : "");
  const [passengers, setPassengers] = useState(String(booking?.passengers ?? 1));
  const [error, setError] = useState("");
  const [openPicker, setOpenPicker] = useState<TripDateField | null>(null);
  const pickerState = tripPickerState(openPicker, setOpenPicker);
  const destination = lookupDestination(destinationIata);
  const airlines: Airline[] = destination?.airlines ?? ["ryanair", "wizzair"];
  const chosenAirline = airline && airlines.includes(airline) ? airline : airlines.length === 1 ? airlines[0] : null;

  function readLeg(fields: LegFields, label: string): BookingLeg | string {
    if (!isIsoDate(fields.date)) return `Podaj datę ${label}.`;
    const depart = parseTimeInput(fields.depart);
    const arrive = parseTimeInput(fields.arrive);
    if (depart === "invalid" || arrive === "invalid") return `Godziny ${label} wpisz jako GG:MM, np. 07:05.`;
    const flightNumber = fields.flightNumber.trim() ? normalizeFlightNumber(fields.flightNumber, chosenAirline ?? "ryanair") : null;
    if (fields.flightNumber.trim() && !flightNumber) return `Numer lotu ${label} wpisz jak na bilecie, np. FR3505.`;
    return { date: fields.date, flightNumber, depart, arrive };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!destination) return setError("Wybierz lotnisko z listy.");
    if (!chosenAirline) return setError("Wybierz linię.");
    if (!hasOutbound && !hasReturn) return setError("Zaznacz wylot z Krakowa, lot powrotny albo oba.");
    let out: BookingLeg | null = null;
    if (hasOutbound) {
      const leg = readLeg(outbound, "wylotu");
      if (typeof leg === "string") return setError(leg);
      out = leg;
    }
    let back: BookingLeg | null = null;
    if (hasReturn) {
      const leg = readLeg(inbound, "powrotu");
      if (typeof leg === "string") return setError(leg);
      if (out && leg.date < out.date) return setError("Data powrotu jest wcześniejsza niż wylot.");
      back = leg;
    }
    const amount = paid.trim() ? parseAmount(paid) : null;
    if (paid.trim() && amount == null) return setError("Kwotę wpisz w złotych, np. 389,98.");
    const people = Number(passengers);
    if (!Number.isInteger(people) || people < 1 || people > 9) return setError("Liczba pasażerów od 1 do 9.");
    onSave({
      airline: chosenAirline,
      destinationIata: destination.iata,
      outbound: out,
      return: back,
      reference: reference.trim() ? reference.trim().toUpperCase() : null,
      paid: amount,
      passengers: people,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg!">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">{booking ? "Edytuj rezerwację" : "Nowa rezerwacja"}</DialogTitle>
            <DialogDescription>
              Loty z KRK i z powrotem. Po wybraniu dnia kliknij lot z rozkładu albo wpisz numer i godziny z biletu.
            </DialogDescription>
          </DialogHeader>

          <DestinationPicker value={destinationIata} onChange={setDestinationIata} />

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Linia</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Linia">
              {(["ryanair", "wizzair"] as const).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={chosenAirline === item ? "default" : "outline"}
                  aria-pressed={chosenAirline === item}
                  disabled={!airlines.includes(item)}
                  onClick={() => setAirline(item)}
                >
                  <AirlineMark airline={item} className="size-5" /> {AIRLINE_LABEL[item]}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={hasOutbound}
                onChange={(event) => setHasOutbound(event.target.checked)}
                className="size-4 accent-primary"
              />
              Wylot z Krakowa
            </label>
            {hasOutbound ? (
              <LegEditor
                title={`Wylot · KRK → ${destination?.iata ?? "…"}`}
                idPrefix="booking-out"
                fields={outbound}
                onChange={setOutbound}
                airline={chosenAirline}
                destinationIata={destination?.iata ?? null}
                direction="out"
                picker={pickerState("from")}
              />
            ) : null}
          </div>

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
              <LegEditor
                title={`Powrót · ${destination?.iata ?? "…"} → KRK`}
                idPrefix="booking-back"
                fields={inbound}
                onChange={setInbound}
                airline={chosenAirline}
                destinationIata={destination?.iata ?? null}
                direction="back"
                min={(hasOutbound && outbound.date) || undefined}
                picker={pickerState("return")}
              />
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="booking-reference">Kod rezerwacji</Label>
              <Input
                id="booking-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="np. AB1CDE"
                autoComplete="off"
                className="h-10 uppercase"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-paid">Zapłacono (zł)</Label>
              <Input
                id="booking-paid"
                value={paid}
                onChange={(event) => setPaid(event.target.value)}
                inputMode="decimal"
                placeholder="np. 389,98"
                className="h-10"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="booking-passengers">Pasażerowie</Label>
              <Input
                id="booking-passengers"
                type="number"
                min={1}
                max={9}
                value={passengers}
                onChange={(event) => setPassengers(event.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit">{booking ? "Zapisz zmiany" : "Dodaj rezerwację"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LegEditor({
  title,
  idPrefix,
  fields,
  onChange,
  airline,
  destinationIata,
  direction,
  min,
  picker,
}: {
  title: string;
  idPrefix: string;
  fields: LegFields;
  onChange: (fields: LegFields) => void;
  airline: Airline | null;
  destinationIata: string | null;
  direction: "out" | "back";
  min?: string;
  picker: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const wizz = useSyncExternalStore(subscribeWizz, getWizzSnapshot, getWizzServerSnapshot);
  const key = airline && destinationIata && isIsoDate(fields.date) ? `${airline}|${destinationIata}|${direction}|${fields.date}` : null;
  const [loaded, setLoaded] = useState<{ key: string; day: DaySchedule } | null>(null);
  const day = key && loaded?.key === key ? loaded.day : null;

  useEffect(() => {
    if (!key || !airline || !destinationIata) return;
    let cancelled = false;
    void loadDay(airline, destinationIata, direction, fields.date, wizz).then((result) => {
      if (!cancelled) setLoaded({ key, day: result });
    });
    return () => {
      cancelled = true;
    };
  }, [key, airline, destinationIata, direction, fields.date, wizz]);

  const set = (patch: Partial<LegFields>) => onChange({ ...fields, ...patch });

  return (
    <fieldset className="grid gap-2 rounded-xl border px-3 py-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Data</Label>
        <DatePicker id={`${idPrefix}-date`} value={fields.date} onChange={(date) => set({ date })} min={min} {...picker} />
      </div>

      {key ? (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted-foreground">
            {!day
              ? "Wczytuję rozkład…"
              : day.status === "unpublished"
                ? `Rozkład na ${formatDate(fields.date)} nie jest jeszcze opublikowany. Wpisz dane z biletu.`
                : day.status === "failed"
                  ? "Rozkład nie odpowiedział. Wpisz dane z biletu."
                  : day.flights.length === 0
                    ? `W rozkładzie nie ma lotu ${formatDate(fields.date)}.`
                    : "Loty z rozkładu tego dnia:"}
          </p>
          {day?.status === "ok" && day.flights.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {day.flights.map((flight) => {
                const picked = fields.depart === flight.depart && (!flight.number || fields.flightNumber.toUpperCase() === flight.number);
                return (
                  <Button
                    key={`${flight.number}-${flight.depart}`}
                    type="button"
                    size="sm"
                    variant={picked ? "default" : "outline"}
                    aria-pressed={picked}
                    className="h-8 tabular-nums"
                    onClick={() =>
                      set({ flightNumber: flight.number ?? fields.flightNumber, depart: flight.depart, arrive: flight.arrive ?? fields.arrive })
                    }
                  >
                    {flightClock(flight.depart, flight.arrive)}
                    {flight.number ? ` · ${flight.number}` : ""}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-number`}>Nr lotu</Label>
          <Input
            id={`${idPrefix}-number`}
            value={fields.flightNumber}
            onChange={(event) => set({ flightNumber: event.target.value })}
            placeholder={airline === "wizzair" ? "W6…" : "FR…"}
            autoComplete="off"
            className={cn("h-10 uppercase")}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-depart`}>Wylot</Label>
          <Input
            id={`${idPrefix}-depart`}
            type="time"
            value={fields.depart}
            onChange={(event) => set({ depart: event.target.value })}
            className="h-10"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-arrive`}>Przylot</Label>
          <Input
            id={`${idPrefix}-arrive`}
            type="time"
            value={fields.arrive}
            onChange={(event) => set({ arrive: event.target.value })}
            className="h-10"
          />
        </div>
      </div>
    </fieldset>
  );
}

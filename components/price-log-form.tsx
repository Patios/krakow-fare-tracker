"use client";

import { useState, type FormEvent } from "react";
import { AirlineChip, AirlineMark } from "@/components/airline-mark";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIRLINE_LABEL } from "@/lib/airports";
import { formatDate, formatPln, formatTripDates, isIsoDate, parseAmount, parseTimeInput, roundMoney, todayIso } from "@/lib/format";
import type { Airline, PriceDraft, SearchTrip } from "@/lib/types";

export function TripDateSummary({ trip, destinationIata }: { trip: SearchTrip; destinationIata: string }) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
      <p>
        <span className="text-muted-foreground">Wylot · </span>
        <span className="font-medium">{formatTripDates(trip.outboundFrom, trip.outboundTo)}</span>
        <span className="text-muted-foreground"> · KRK → {destinationIata}</span>
      </p>
      <p>
        <span className="text-muted-foreground">Powrót · </span>
        {trip.returnDate ? (
          <>
            <span className="font-medium">{formatDate(trip.returnDate)}</span>
            <span className="text-muted-foreground"> · {destinationIata} → KRK</span>
          </>
        ) : (
          <span className="font-medium">W jedną stronę</span>
        )}
      </p>
    </div>
  );
}

export function PriceLogForm({
  airlines,
  trip,
  idPrefix = "",
  submitLabel = "Zapisz cenę",
  onCancel,
  onSave,
  onSaved,
}: {
  airlines: Airline[];
  trip: SearchTrip;
  idPrefix?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSave: (entry: PriceDraft) => boolean;
  onSaved?: (entry: PriceDraft) => void;
}) {
  const hasReturn = trip.returnDate != null;
  const onlyAirline = airlines.length === 1 ? airlines[0] : null;
  const [airline, setAirline] = useState<Airline | "">(onlyAirline ?? "");
  const [amount, setAmount] = useState("");
  const [outboundAmount, setOutboundAmount] = useState("");
  const [returnAmount, setReturnAmount] = useState("");
  const [checkedOn, setCheckedOn] = useState(todayIso());
  const [outboundDepart, setOutboundDepart] = useState("");
  const [outboundArrive, setOutboundArrive] = useState("");
  const [returnDepart, setReturnDepart] = useState("");
  const [returnArrive, setReturnArrive] = useState("");
  const [error, setError] = useState("");
  const today = todayIso();
  const items = airlines.map((item) => ({ value: item, label: AIRLINE_LABEL[item] }));
  const outboundDate = formatTripDates(trip.outboundFrom, trip.outboundTo);
  const returnDate = trip.returnDate ? formatDate(trip.returnDate) : null;
  const outboundFare = hasReturn ? parseAmount(outboundAmount) : null;
  const returnFare = hasReturn ? parseAmount(returnAmount) : null;
  const total = outboundFare != null && returnFare != null ? roundMoney(outboundFare + returnFare) : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = onlyAirline ?? airline;
    if (chosen !== "ryanair" && chosen !== "wizzair") {
      setError("Wybierz linię.");
      return;
    }
    if (!airlines.includes(chosen)) {
      setError("Ta linia nie lata na ten kierunek z Krakowa.");
      return;
    }
    let parsed: number;
    let legs: { outboundAmount: number; returnAmount: number } | null = null;
    if (hasReturn) {
      if (outboundFare == null || returnFare == null) {
        setError("Podaj cenę wylotu i powrotu. Każda większa od zera, maksymalnie z groszami. Waluta to PLN.");
        return;
      }
      parsed = roundMoney(outboundFare + returnFare);
      legs = { outboundAmount: outboundFare, returnAmount: returnFare };
    } else {
      const single = parseAmount(amount);
      if (single == null) {
        setError("Podaj cenę większą od zera, maksymalnie z groszami. Waluta to PLN.");
        return;
      }
      parsed = single;
    }
    if (!isIsoDate(checkedOn) || checkedOn > today) {
      setError("Data sprawdzenia nie może być z przyszłości.");
      return;
    }
    const times = {
      outboundDepart: parseTimeInput(outboundDepart),
      outboundArrive: parseTimeInput(outboundArrive),
      returnDepart: hasReturn ? parseTimeInput(returnDepart) : null,
      returnArrive: hasReturn ? parseTimeInput(returnArrive) : null,
    };
    if (
      times.outboundDepart === "invalid" ||
      times.outboundArrive === "invalid" ||
      times.returnDepart === "invalid" ||
      times.returnArrive === "invalid"
    ) {
      setError("Podaj godzinę w formacie gg:mm albo zostaw pole puste.");
      return;
    }
    const entry: PriceDraft = {
      airline: chosen,
      amount: parsed,
      checkedOn,
      outboundDepart: times.outboundDepart,
      outboundArrive: times.outboundArrive,
      returnDepart: times.returnDepart,
      returnArrive: times.returnArrive,
      ...(legs ?? {}),
    };
    if (!onSave(entry)) {
      setError("Nie udało się zapisać ceny w tej przeglądarce.");
      return;
    }
    setAmount("");
    setOutboundAmount("");
    setReturnAmount("");
    setOutboundDepart("");
    setOutboundArrive("");
    setReturnDepart("");
    setReturnArrive("");
    setError("");
    onSaved?.(entry);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {onlyAirline ? (
        <p className="flex items-center gap-2 text-sm">
          Linia: <AirlineChip airline={onlyAirline} />
        </p>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor={`airline${idPrefix}`}>Linia</Label>
          <Select
            items={items}
            value={airline || null}
            onValueChange={(next) => {
              if (next === "ryanair" || next === "wizzair") setAirline(next);
            }}
          >
            <SelectTrigger id={`airline${idPrefix}`} className="w-full">
              <SelectValue placeholder="Wybierz linię" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <AirlineMark airline={item.value} className="size-5" />
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`checked-on${idPrefix}`}>Data sprawdzenia</Label>
        <Input
          id={`checked-on${idPrefix}`}
          type="date"
          value={checkedOn}
          max={today}
          onChange={(event) => setCheckedOn(event.target.value)}
          className="h-10"
          required
        />
      </div>

      <p className="text-sm text-muted-foreground">Godziny z karty lotu u linii. Puste pole zostaje puste.</p>

      <section className="grid gap-3 rounded-xl border p-3">
        <h3 className="text-sm font-medium">Wylot · {outboundDate}</h3>
        <AmountField
          id={`amount${idPrefix}`}
          label={hasReturn ? "Kwota wylotu" : "Kwota"}
          value={hasReturn ? outboundAmount : amount}
          onChange={hasReturn ? setOutboundAmount : setAmount}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <TimeField
            id={`outbound-depart${idPrefix}`}
            label="Wylot z KRK"
            value={outboundDepart}
            onChange={setOutboundDepart}
          />
          <TimeField
            id={`outbound-arrive${idPrefix}`}
            label="Przylot"
            value={outboundArrive}
            onChange={setOutboundArrive}
          />
        </div>
      </section>

      {hasReturn && returnDate ? (
        <section className="grid gap-3 rounded-xl border p-3">
          <h3 className="text-sm font-medium">Powrót · {returnDate}</h3>
          <AmountField
            id={`return-amount${idPrefix}`}
            label="Kwota powrotu"
            value={returnAmount}
            onChange={setReturnAmount}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <TimeField
              id={`return-depart${idPrefix}`}
              label="Wylot powrotny"
              value={returnDepart}
              onChange={setReturnDepart}
            />
            <TimeField
              id={`return-arrive${idPrefix}`}
              label="Przylot do KRK"
              value={returnArrive}
              onChange={setReturnArrive}
            />
          </div>
        </section>
      ) : null}

      {total != null ? (
        <p className="text-sm">
          Razem <span className="font-medium tabular-nums">{formatPln(total)}</span>
          <span className="text-muted-foreground"> · tyle zapisze się w historii</span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Anuluj
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

function AmountField({
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
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="np. 149,99"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10"
          required
        />
        <span className="text-sm font-medium">PLN</span>
      </div>
    </div>
  );
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

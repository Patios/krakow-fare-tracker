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
import { isIsoDate, parseAmount, parseTimeInput, todayIso } from "@/lib/format";
import type { Airline, PriceDraft } from "@/lib/types";

export function PriceLogForm({
  airlines,
  hasReturn,
  idPrefix = "",
  submitLabel = "Zapisz cenę",
  onCancel,
  onSave,
  onSaved,
}: {
  airlines: Airline[];
  hasReturn: boolean;
  idPrefix?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSave: (entry: PriceDraft) => boolean;
  onSaved?: (amount: number) => void;
}) {
  const onlyAirline = airlines.length === 1 ? airlines[0] : null;
  const [airline, setAirline] = useState<Airline | "">(onlyAirline ?? "");
  const [amount, setAmount] = useState("");
  const [checkedOn, setCheckedOn] = useState(todayIso());
  const [outboundDepart, setOutboundDepart] = useState("");
  const [outboundArrive, setOutboundArrive] = useState("");
  const [returnDepart, setReturnDepart] = useState("");
  const [returnArrive, setReturnArrive] = useState("");
  const [error, setError] = useState("");
  const today = todayIso();
  const items = airlines.map((item) => ({ value: item, label: AIRLINE_LABEL[item] }));

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
    const parsed = parseAmount(amount);
    if (parsed == null) {
      setError("Podaj cenę większą od zera, maksymalnie z groszami. Waluta to PLN.");
      return;
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
    if (
      !onSave({
        airline: chosen,
        amount: parsed,
        checkedOn,
        outboundDepart: times.outboundDepart,
        outboundArrive: times.outboundArrive,
        returnDepart: times.returnDepart,
        returnArrive: times.returnArrive,
      })
    ) {
      setError("Nie udało się zapisać ceny w tej przeglądarce.");
      return;
    }
    setAmount("");
    setOutboundDepart("");
    setOutboundArrive("");
    setReturnDepart("");
    setReturnArrive("");
    setError("");
    onSaved?.(parsed);
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
        <Label htmlFor={`amount${idPrefix}`}>Kwota</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`amount${idPrefix}`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="np. 149,99"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-10"
            required
          />
          <span className="text-sm font-medium">PLN</span>
        </div>
      </div>

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

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Godziny lotu</legend>
        <p className="text-sm text-muted-foreground">Z karty lotu u linii. Puste pole zostaje puste.</p>
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
        {hasReturn ? (
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
        ) : null}
      </fieldset>

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

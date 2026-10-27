"use client";

import { useState, type FormEvent } from "react";
import { AIRLINE_LABEL } from "@/lib/airports";
import { isIsoDate, parseAmount, todayIso } from "@/lib/format";
import type { Airline } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LogPriceDialog({
  open,
  city,
  airlines,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  city: string;
  airlines: Airline[];
  onOpenChange: (open: boolean) => void;
  onSave: (entry: { airline: Airline; amount: number; checkedOn: string }) => boolean;
}) {
  const onlyAirline = airlines.length === 1 ? airlines[0] : null;
  const [airline, setAirline] = useState<Airline | "">(onlyAirline ?? "");
  const [amount, setAmount] = useState("");
  const [checkedOn, setCheckedOn] = useState(todayIso());
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
    if (!onSave({ airline: chosen, amount: parsed, checkedOn })) {
      setError("Nie udało się zapisać ceny w tej przeglądarce.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md!">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">Zapisz cenę</DialogTitle>
            <DialogDescription>
              {city}. Wpisz kwotę, którą widzisz u przewoźnika. Zapis zostaje w tej przeglądarce, w PLN.
            </DialogDescription>
          </DialogHeader>

          {onlyAirline ? (
            <p className="text-sm">
              Linia: <span className="font-medium">{AIRLINE_LABEL[onlyAirline]}</span>
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="airline">Linia</Label>
              <Select
                items={items}
                value={airline || null}
                onValueChange={(next) => {
                  if (next === "ryanair" || next === "wizzair") setAirline(next);
                }}
              >
                <SelectTrigger id="airline" className="w-full">
                  <SelectValue placeholder="Wybierz linię" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="amount">Kwota</Label>
            <div className="flex items-center gap-2">
              <Input
                id="amount"
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
            <Label htmlFor="checked-on">Data sprawdzenia</Label>
            <Input
              id="checked-on"
              type="date"
              value={checkedOn}
              max={today}
              onChange={(event) => setCheckedOn(event.target.value)}
              className="h-10"
              required
            />
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
            <Button type="submit">Zapisz cenę</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

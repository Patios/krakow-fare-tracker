"use client";

import { useState, type FormEvent } from "react";
import { AirlineChip } from "@/components/airline-mark";
import { DatePicker, tripPickerState, type TripDateField } from "@/components/date-picker";
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
import { destinations } from "@/lib/airports";
import { flightClock, formatDate, formatPln, formatTripDates, isIsoDate } from "@/lib/format";
import { findRyanairRoutes, wizzOnlyDestinations, type FinderResult, type FoundRoute } from "@/lib/route-finder";
import { normalizeTrip, sameTrip } from "@/lib/routes";
import type { Destination, SearchTrip, WatchedRoute } from "@/lib/types";

const WIZZ_ONLY = wizzOnlyDestinations(destinations);

export function RouteFinderDialog({
  routes,
  onOpenChange,
  onAdd,
}: {
  routes: WatchedRoute[];
  onOpenChange: (open: boolean) => void;
  onAdd: (trip: SearchTrip & { destinationIata: string }, found: FoundRoute | null) => boolean;
}) {
  const [mode, setMode] = useState<"day" | "range">("day");
  const [outboundFrom, setOutboundFrom] = useState("");
  const [outboundTo, setOutboundTo] = useState("");
  const [hasReturn, setHasReturn] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [openPicker, setOpenPicker] = useState<TripDateField | null>(null);
  const pickerState = tripPickerState(openPicker, setOpenPicker);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<{ trip: SearchTrip; result: FinderResult } | null>(null);
  const [query, setQuery] = useState("");
  const [addError, setAddError] = useState("");
  const [sort, setSort] = useState<FinderSort>("cheapest");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isIsoDate(outboundFrom)) {
      setError("Podaj datę wylotu.");
      return;
    }
    if (mode === "range" && (!isIsoDate(outboundTo) || outboundTo < outboundFrom)) {
      setError("Podaj koniec zakresu, nie wcześniejszy niż początek.");
      return;
    }
    if (hasReturn && (!isIsoDate(returnDate) || returnDate < outboundFrom)) {
      setError("Podaj datę powrotu, nie wcześniejszą niż wylot.");
      return;
    }
    setError("");
    const trip = normalizeTrip({
      outboundFrom,
      outboundTo: mode === "range" ? outboundTo : null,
      returnDate: hasReturn ? returnDate : null,
    });
    setSearching(true);
    try {
      setSearch({ trip, result: await findRyanairRoutes(trip) });
    } catch {
      setSearch({ trip, result: { ok: false, reason: "blocked" } });
    } finally {
      setSearching(false);
    }
  }

  function saved(destinationIata: string) {
    return search != null && routes.some((route) => sameTrip(route, { destinationIata, ...search.trip }));
  }

  function add(destinationIata: string, found: FoundRoute | null) {
    if (!search) return;
    setAddError(onAdd({ destinationIata, ...search.trip }, found) ? "" : "Nie udało się zapisać trasy w tej przeglądarce.");
  }

  const needle = query.trim().toLocaleLowerCase("pl");
  const matches = (destination: Destination) =>
    !needle ||
    [destination.city, destination.country, destination.iata, destination.airport].some((text) =>
      text.toLocaleLowerCase("pl").includes(needle),
    );
  const found = search?.result.ok
    ? sortFound(search.result.routes.filter((route) => matches(route.destination)), sort)
    : [];
  const wizz = WIZZ_ONLY.filter(matches);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Znajdź trasy w terminie</DialogTitle>
          <DialogDescription>
            Podaj daty, a aplikacja zapyta Ryanair o wszystkie kierunki z KRK z lotem w tym terminie. Dodana trasa
            dostaje daty z wyszukiwania i znalezioną cenę.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-3">
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
              <Label htmlFor="finder-from">{mode === "range" ? "Wylot od" : "Data wylotu"}</Label>
              <DatePicker
                id="finder-from"
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
                <Label htmlFor="finder-to">Wylot do</Label>
                <DatePicker
                  id="finder-to"
                  value={outboundTo}
                  onChange={setOutboundTo}
                  min={outboundFrom || undefined}
                  {...pickerState("to")}
                />
              </div>
            ) : null}
          </div>
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
              <Label htmlFor="finder-return">Data powrotu</Label>
              <DatePicker
                id="finder-return"
                value={returnDate}
                onChange={setReturnDate}
                min={outboundFrom || undefined}
                {...pickerState("return")}
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={searching} className="h-10 font-semibold">
            {searching ? "Szukam…" : "Szukaj tras"}
          </Button>
        </form>

        {search ? (
          <section className="grid gap-3" aria-label="Znalezione trasy" aria-live="polite">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Termin: {formatTripDates(search.trip.outboundFrom, search.trip.outboundTo)}
                {search.trip.returnDate ? `, powrót ${formatDate(search.trip.returnDate)}` : ", w jedną stronę"}
                {search.result.ok ? ` · Ryanair: ${search.result.routes.length} kierunków` : ""}
              </p>
              <Input
                aria-label="Filtruj znalezione kierunki"
                placeholder="Miasto, kraj lub kod"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 sm:w-56"
              />
            </div>
            {search.result.ok && search.result.routes.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sortowanie wyników">
                <span className="text-sm text-muted-foreground">Sortuj:</span>
                {SORTS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={sort === option.id ? "default" : "outline"}
                    aria-pressed={sort === option.id}
                    onClick={() => setSort(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}
            {addError ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
              </p>
            ) : null}

            {!search.result.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {search.result.reason === "blocked"
                  ? "Przeglądarka nie dostała odpowiedzi od Ryanair. Spróbuj ponownie."
                  : "Ryanair nie zwrócił czytelnej listy lotów."}
              </p>
            ) : found.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {search.result.routes.length === 0
                  ? "Ryanair nie sprzedaje lotów z KRK w tym terminie."
                  : "Żaden znaleziony kierunek nie pasuje do filtra."}
              </p>
            ) : (
              <ul className="grid gap-2">
                {found.map((route) => (
                  <li
                    key={route.destination.iata}
                    className="flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="grid gap-0.5">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {route.destination.city}
                        <span className="text-xs text-muted-foreground">
                          {route.destination.iata} · {route.destination.country}
                        </span>
                        {route.destination.airlines.includes("wizzair") ? <AirlineChip airline="wizzair" /> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {legText("Wylot", route.outbound)}
                        {route.inbound ? ` · ${legText("powrót", route.inbound)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <span className="font-heading text-xl font-bold tabular-nums text-brand-ink dark:text-ryanair-yellow">
                        {formatPln(route.amount)}
                      </span>
                      <AddButton saved={saved(route.destination.iata)} onAdd={() => add(route.destination.iata, route)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {search.result.ok && search.result.unlisted > 0 ? (
              <p className="text-xs text-muted-foreground">
                Pominięto {search.result.unlisted} kierunków spoza zimowego rozkładu Kraków Airport.
              </p>
            ) : null}

            {wizz.length > 0 ? (
              <details className="rounded-lg ring-1 ring-foreground/10">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  Kierunki tylko Wizz Air ({wizz.length}): bez sprawdzenia lotu i ceny
                </summary>
                <p className="px-3 text-sm text-muted-foreground">
                  Wizz Air blokuje odczyt z przeglądarki. Dodaj trasę i sprawdź ją przyciskiem „Sprawdź dziś · Wizz
                  Air”.
                </p>
                <ul className="grid gap-1 p-3">
                  {wizz.map((destination) => (
                    <li key={destination.iata} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {destination.city}{" "}
                        <span className="text-xs text-muted-foreground">
                          {destination.iata} · {destination.country}
                        </span>
                      </span>
                      <AddButton saved={saved(destination.iata)} onAdd={() => add(destination.iata, null)} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FinderSort = "cheapest" | "priciest" | "city" | "earliest";

const SORTS: { id: FinderSort; label: string }[] = [
  { id: "cheapest", label: "Najtańsze" },
  { id: "priciest", label: "Najdroższe" },
  { id: "earliest", label: "Najwcześniejszy wylot" },
  { id: "city", label: "Miasto A–Z" },
];

function sortFound(routes: FoundRoute[], sort: FinderSort): FoundRoute[] {
  const sorted = [...routes];
  if (sort === "cheapest") sorted.sort((a, b) => a.amount - b.amount);
  if (sort === "priciest") sorted.sort((a, b) => b.amount - a.amount);
  if (sort === "city") sorted.sort((a, b) => a.destination.city.localeCompare(b.destination.city, "pl"));
  if (sort === "earliest") {
    sorted.sort(
      (a, b) =>
        `${a.outbound.date}T${a.outbound.departs ?? ""}`.localeCompare(`${b.outbound.date}T${b.outbound.departs ?? ""}`) ||
        a.amount - b.amount,
    );
  }
  return sorted;
}

function AddButton({ saved, onAdd }: { saved: boolean; onAdd: () => void }) {
  return (
    <Button type="button" size="sm" variant={saved ? "ghost" : "outline"} disabled={saved} onClick={onAdd}>
      {saved ? "Na liście" : "Dodaj"}
    </Button>
  );
}

function legText(label: string, leg: FoundRoute["outbound"]) {
  const times = flightClock(leg.departs, leg.arrives);
  return `${label} ${formatDate(leg.date)}${times ? ` ${times}` : ""}${leg.number ? ` (${leg.number})` : ""}`;
}

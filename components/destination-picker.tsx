"use client";

import { useMemo, useState } from "react";
import { AIRLINE_LABEL, destinationByIata, destinations } from "@/lib/airports";
import { foldText } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DestinationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iata: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = value ? destinationByIata.get(value) : undefined;
  const foldedQuery = foldText(query.trim());

  const matches = useMemo(() => {
    if (!foldedQuery) return destinations;
    return destinations.filter((destination) => {
      const airlines = destination.airlines.map((airline) => AIRLINE_LABEL[airline]).join(" ");
      const haystack = foldText(
        `${destination.city} ${destination.airport} ${destination.country} ${destination.iata} ${airlines}`,
      );
      return haystack.includes(foldedQuery);
    });
  }, [foldedQuery]);

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium" htmlFor="destination-search">
        Kierunek
      </label>
      {selected ? (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">{selected.city}</span>
          <span className="text-muted-foreground">
            {" "}
            · {selected.airport} · {selected.iata} ·{" "}
            {selected.airlines.map((airline) => AIRLINE_LABEL[airline]).join(", ")}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Wybierz lotnisko z zimowego rozkładu.</p>
      )}
      <Input
        id="destination-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Miasto, kraj albo kod IATA"
        autoComplete="off"
        className="h-10"
        aria-controls="destination-list"
      />
      <p className="text-xs text-muted-foreground">
        {matches.length} z {destinations.length}
      </p>
      <ul
        id="destination-list"
        role="listbox"
        aria-label="Lotniska z Krakowa"
        className="max-h-52 overflow-y-auto rounded-lg ring-1 ring-foreground/10"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">
            Brak lotniska dla „{query.trim()}”. Lista ma tylko Ryanair i Wizz Air z zimowego rozkładu.
          </li>
        ) : (
          matches.map((destination) => {
            const selectedItem = destination.iata === value;
            return (
              <li key={destination.iata}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedItem}
                  onClick={() => onChange(destination.iata)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent",
                    selectedItem && "bg-accent",
                  )}
                >
                  <span>
                    <span className="font-medium">{destination.city}</span>
                    <span className="block text-xs text-muted-foreground">
                      {destination.airport} · {destination.country}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-heading text-sm">{destination.iata}</span>
                    <span className="block text-xs text-muted-foreground">
                      {destination.airlines.map((airline) => AIRLINE_LABEL[airline]).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

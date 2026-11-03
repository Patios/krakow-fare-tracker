"use client";

import { PriceLogForm, TripDateSummary } from "@/components/price-log-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Airline, PriceDraft, SearchTrip } from "@/lib/types";

export function LogPriceDialog({
  open,
  city,
  destinationIata,
  airlines,
  trip,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  city: string;
  destinationIata: string;
  airlines: Airline[];
  trip: SearchTrip;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: PriceDraft) => boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md!">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Zapisz cenę</DialogTitle>
          <DialogDescription>
            {city}.{" "}
            {trip.returnDate
              ? "Wpisz osobno kwotę wylotu i powrotu oraz godziny z karty lotu. Zapis jest w PLN."
              : "Wpisz kwotę i godziny, które widzisz u przewoźnika. Zapis jest w PLN."}
          </DialogDescription>
        </DialogHeader>
        <TripDateSummary trip={trip} destinationIata={destinationIata} />
        <PriceLogForm
          airlines={airlines}
          trip={trip}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { PriceLogForm } from "@/components/price-log-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Airline, PriceDraft } from "@/lib/types";

export function LogPriceDialog({
  open,
  city,
  airlines,
  hasReturn,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  city: string;
  airlines: Airline[];
  hasReturn: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: PriceDraft) => boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md!">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">Zapisz cenę</DialogTitle>
          <DialogDescription>
            {city}. Wpisz kwotę i godziny, które widzisz u przewoźnika. Zapis jest w PLN.
          </DialogDescription>
        </DialogHeader>
        <PriceLogForm
          airlines={airlines}
          hasReturn={hasReturn}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

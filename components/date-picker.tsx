"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthGrid, monthStart, shiftMonth } from "@/lib/fare-calendar";
import { formatDate, isIsoDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" });

export type TripDateField = "from" | "to" | "return";

/** One calendar open at a time; closing one never closes a calendar opened right after it. */
export function tripPickerState(
  openPicker: TripDateField | null,
  setOpenPicker: (update: (current: TripDateField | null) => TripDateField | null) => void,
) {
  return (field: TripDateField) => ({
    open: openPicker === field,
    onOpenChange: (open: boolean) =>
      setOpenPicker((current) => (open ? field : current === field ? null : current)),
  });
}

/** A date field whose calendar closes as soon as a day is picked. */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  open,
  onOpenChange,
  placeholder = "Wybierz datę",
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}) {
  return (
    <Popover.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Popover.Trigger
        id={id}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
          !isIsoDate(value) && "text-muted-foreground",
        )}
      >
        {isIsoDate(value) ? formatDate(value) : placeholder}
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
          <Popover.Popup
            aria-label="Kalendarz"
            className="w-72 rounded-xl bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          >
            <MonthPanel
              value={value}
              min={min}
              onPick={(iso) => {
                onChange(iso);
                onOpenChange(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MonthPanel({ value, min, onPick }: { value: string; min?: string; onPick: (iso: string) => void }) {
  const today = todayIso();
  const floor = min && isIsoDate(min) ? min : null;
  const [month, setMonth] = useState(() =>
    monthStart(isIsoDate(value) && (!floor || value >= floor) ? value : floor ?? today),
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Poprzedni miesiąc"
          disabled={floor != null && month <= monthStart(floor)}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <p className="text-sm font-semibold capitalize" aria-live="polite">
          {monthFormatter.format(new Date(`${month}T00:00:00Z`))}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Następny miesiąc"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthGrid(month).map((date, index) => {
          if (!date) return <span key={`pad-${index}`} />;
          const disabled = floor != null && date < floor;
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={formatDate(date)}
              onClick={() => onPick(date)}
              className={cn(
                "h-9 rounded-md text-sm tabular-nums transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
                date === today && "font-semibold underline underline-offset-4",
                selected && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

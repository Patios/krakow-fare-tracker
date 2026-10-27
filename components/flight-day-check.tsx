"use client";

import { useEffect, useRef, useState } from "react";
import { AirlineMark } from "@/components/airline-mark";
import { Button } from "@/components/ui/button";
import { AIRLINE_LABEL } from "@/lib/airports";
import { formatDate } from "@/lib/format";
import {
  MAX_FLIGHT_DAY_SPAN,
  checkRouteFlights,
  type FlightDay,
  type FlightLegReport,
  type FlightReadFailure,
} from "@/lib/flight-day";
import type { Airline, WatchedRoute } from "@/lib/types";

type CheckState = {
  signature: string;
  pending: boolean;
  failed: boolean;
  reports: FlightLegReport[] | null;
};

export function FlightDayCheck({ route, airlines }: { route: WatchedRoute; airlines: Airline[] }) {
  const [state, setState] = useState<CheckState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const signature = `${route.id}|${route.destinationIata}|${route.outboundFrom}|${route.outboundTo ?? ""}|${route.returnDate ?? ""}|${airlines.join(",")}`;
  const current = state?.signature === signature ? state : null;
  const pending = current?.pending ?? false;
  const failed = current?.failed ?? false;
  const reports = current?.reports ?? null;

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [signature]);

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const request = signature;
    setState({ signature: request, pending: true, failed: false, reports: null });
    try {
      const next = await checkRouteFlights(route, airlines, fetch, controller.signal);
      if (controller.signal.aborted) return;
      setState({ signature: request, pending: false, failed: false, reports: next });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setState({ signature: request, pending: false, failed: true, reports: null });
    }
  }

  if (airlines.length === 0) return null;

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-fit"
        disabled={pending}
        aria-label={`Czy jest lot z KRK do ${route.destinationIata}, ${formatDate(route.outboundFrom)}`}
        onClick={() => void run()}
      >
        {pending ? "Sprawdzam…" : "Czy jest lot?"}
      </Button>

      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Sprawdzam, czy linia sprzedaje lot w zapisanym dniu.
        </p>
      ) : null}

      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Nie udało się sprawdzić rozkładu.
        </p>
      ) : null}

      {reports ? (
        <div role="status" className="grid gap-3">
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak poprawnej daty wylotu.</p>
          ) : (
            reports.map((report) => <LegResult key={`${report.airline}-${report.direction}`} report={report} />)
          )}
          <p className="text-sm text-muted-foreground">
            Wynik jest ze sprzedaży biletu u linii. To nie znaczy, że samolot na pewno wystartuje.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LegResult({ report }: { report: FlightLegReport }) {
  const direction = report.direction === "outbound" ? "Wylot" : "Powrót";
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <AirlineMark airline={report.airline} className="size-5" />
        {AIRLINE_LABEL[report.airline]} · {direction} {report.origin} → {report.destination}
      </p>
      {report.failure ? (
        <p className="text-sm text-muted-foreground">{failureCopy(report.airline, report.failure)}</p>
      ) : (
        <ul className="grid gap-0.5">
          {report.days.map((day) => (
            <li key={day.date} className="text-sm">
              <DayLine day={day} />
            </li>
          ))}
        </ul>
      )}
      {report.truncated ? (
        <p className="text-sm text-muted-foreground">
          Zakres jest dłuższy. Sprawdzone są pierwsze {MAX_FLIGHT_DAY_SPAN} dni.
        </p>
      ) : null}
    </div>
  );
}

function DayLine({ day }: { day: FlightDay }) {
  const when = formatDate(day.date);
  if (day.status === "operated") {
    const detail = flightDetail(day);
    return (
      <span className="text-emerald-800 dark:text-emerald-300">
        {when} · jest w sprzedaży{detail ? ` · ${detail}` : ""}
      </span>
    );
  }
  if (day.status === "absent") {
    return <span className="text-muted-foreground">{when} · brak lotu w sprzedaży</span>;
  }
  return <span className="text-muted-foreground">{when} · nie udało się sprawdzić</span>;
}

function flightDetail(day: FlightDay): string {
  return day.flights
    .map((flight) => {
      if (flight.number && flight.departs) return `${flight.number} o ${flight.departs}`;
      return flight.number || (flight.departs ? `o ${flight.departs}` : "");
    })
    .filter(Boolean)
    .join(", ");
}

function failureCopy(airline: Airline, failure: FlightReadFailure): string {
  const label = AIRLINE_LABEL[airline];
  if (failure === "blocked") {
    return `Przeglądarka nie pozwala odczytać rozkładu ${label} z tej strony. Ten dzień otworzysz przyciskiem „Sprawdź dziś”.`;
  }
  return `Rozkład ${label} nie odpowiedział.`;
}

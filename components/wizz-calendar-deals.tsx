"use client";

import Link from "next/link";
import { ChevronDown, PlaneTakeoff, Sparkles } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDealSectionExpanded } from "@/lib/deals-sections";
import { formatDate, formatPln } from "@/lib/format";
import type { WizzCalendarDeal, WizzData } from "@/lib/wizz-data";

export function WizzCalendarDeals({ deals, data, state }: { deals: WizzCalendarDeal[]; data: WizzData | null; state: "loading" | "ready" | "error" }) {
  const [expanded, toggleExpanded] = useDealSectionExpanded("wizzair");
  return (
    <section aria-labelledby="wizz-calendar-deals-heading" className="overflow-hidden rounded-xl border border-wizz/30 bg-wizz/5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-wizz/20 px-4 py-4 sm:px-5">
        <div>
          <h2 id="wizz-calendar-deals-heading" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-wide">
            <Sparkles className="size-5 text-wizz" /> Najtańsze loty Wizz Air
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Najniższy bilet w jedną stronę dla każdego kierunku z Krakowa w najbliższych 31 dniach.</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? <Badge variant="outline">{deals.length} kierunków</Badge> : null}
          <Button type="button" variant="outline" size="sm" aria-expanded={expanded} aria-controls="wizz-calendar-deals-list" onClick={toggleExpanded}>
            <ChevronDown className={expanded ? "rotate-180" : undefined} /> {expanded ? "Zwiń" : "Rozwiń"}
          </Button>
        </div>
      </div>
      {expanded && state === "error" ? (
        <p role="alert" className="px-4 py-5 text-sm text-destructive sm:px-5">Nie udało się wczytać opublikowanego kalendarza Wizz Air.</p>
      ) : expanded && !data ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Wczytuję aktualny kalendarz Wizz Air…</p>
      ) : expanded && deals.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Brak potwierdzonych cen Wizz Air w najbliższych 31 dniach.</p>
      ) : expanded ? (
        <ol id="wizz-calendar-deals-list" className="divide-y divide-wizz/20">
          {deals.map((deal) => (
            <li key={deal.destination.iata} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                  <span>{deal.destination.city}</span>
                  <span className="text-sm text-muted-foreground">KRK → {deal.destination.iata} · {deal.destination.country}</span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><AirlineMark airline="wizzair" className="size-4" /> Wizz Air</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><PlaneTakeoff className="size-4" /> {formatDate(deal.date)}{deal.departs ? ` · ${deal.departs}` : ""}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:text-right">
                <div>
                  <p className="font-heading text-3xl font-bold tracking-wide text-wizz tabular-nums">{formatPln(deal.amount)}</p>
                  <p className="text-xs text-muted-foreground">odczyt {formatDate(deal.checkedAt.slice(0, 10))}</p>
                </div>
                <Button nativeButton={false} render={<Link href={`/?destination=${deal.destination.iata}`} />} variant="outline" size="sm">Obserwuj</Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

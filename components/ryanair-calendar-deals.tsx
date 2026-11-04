import Link from "next/link";
import { PlaneTakeoff, Sparkles } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPln } from "@/lib/format";
import type { RyanairCalendarDeal, RyanairData } from "@/lib/ryanair-data";

export function RyanairCalendarDeals({ deals, data, state }: { deals: RyanairCalendarDeal[]; data: RyanairData | null; state: "loading" | "ready" | "error" }) {
  return (
    <section aria-labelledby="ryanair-calendar-deals-heading" className="overflow-hidden rounded-xl border border-ryanair-yellow/60 bg-ryanair-yellow/10">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ryanair-yellow/40 px-4 py-4 sm:px-5">
        <div>
          <h2 id="ryanair-calendar-deals-heading" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-wide">
            <Sparkles className="size-5 text-ryanair" /> Najtańsze loty Ryanair
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Najniższy bilet w jedną stronę dla każdego kierunku z Krakowa, bez dodawania trasy.</p>
        </div>
        {data ? <Badge variant="outline">{deals.length} kierunków · do {formatDate(data.through)}</Badge> : null}
      </div>
      {state === "error" ? (
        <p role="alert" className="px-4 py-5 text-sm text-destructive sm:px-5">Nie udało się wczytać opublikowanego kalendarza Ryanair.</p>
      ) : !data ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Wczytuję aktualny kalendarz Ryanair…</p>
      ) : deals.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">Brak aktualnych cen Ryanair w opublikowanym okresie.</p>
      ) : (
        <ol className="divide-y divide-ryanair-yellow/35">
          {deals.map((deal) => (
            <li key={deal.destination.iata} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                  <span>{deal.destination.city}</span>
                  <span className="text-sm text-muted-foreground">KRK → {deal.destination.iata} · {deal.destination.country}</span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><AirlineMark airline="ryanair" className="size-4" /> Ryanair</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><PlaneTakeoff className="size-4" /> {formatDate(deal.date)}{deal.departs ? ` · ${deal.departs}${deal.arrives ? `–${deal.arrives}` : ""}` : ""}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:text-right">
                <div>
                  <p className="font-heading text-3xl font-bold tracking-wide text-brand-ink tabular-nums dark:text-ryanair-yellow">{formatPln(deal.amount)}</p>
                  <p className="text-xs text-muted-foreground">odczyt {formatDate(deal.checkedAt.slice(0, 10))}</p>
                </div>
                <Button nativeButton={false} render={<Link href={`/?destination=${deal.destination.iata}`} />} variant="outline" size="sm">Obserwuj</Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

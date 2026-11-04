import { Sparkles } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { Badge } from "@/components/ui/badge";
import { AIRLINE_LABEL } from "@/lib/airports";
import type { DealRecommendation } from "@/lib/deals";
import { formatDate, formatPln, formatTripDates } from "@/lib/format";
import { lookupDestination } from "@/lib/network-refresh";

export function BestDeals({ deals, filtered = false }: { deals: DealRecommendation[]; filtered?: boolean }) {
  return (
    <section aria-labelledby="best-deals-heading" className="overflow-hidden rounded-xl border border-emerald-700/20 bg-emerald-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-700/15 px-4 py-4 sm:px-5">
        <div>
          <h2 id="best-deals-heading" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-wide">
            <Sparkles className="size-5 text-emerald-700 dark:text-emerald-400" />
            Okazje obserwowanych tras
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Ceny dla wylotów w ciągu najbliższych 31 dni.</p>
        </div>
        {deals.length > 0 ? <Badge className="bg-emerald-800 text-white">{deals.length} {dealWord(deals.length)}</Badge> : null}
      </div>
      {deals.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
          {filtered
            ? "Żadna obserwowana trasa nie ma rekomendacji dla wybranej linii."
            : "Brak wyraźnych okazji w zapisanej historii. Dodaj co najmniej dwa odczyty ceny dla tej samej trasy i linii."}
        </p>
      ) : (
        <ol className="divide-y divide-emerald-700/15">
          {deals.map((deal) => {
            const destination = lookupDestination(deal.route.destinationIata);
            return (
              <li key={`${deal.route.id}-${deal.airline}`} className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span>{destination?.city ?? deal.route.destinationIata}</span>
                    <span className="text-sm text-muted-foreground">KRK → {deal.route.destinationIata}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <AirlineMark airline={deal.airline} className="size-4" /> {AIRLINE_LABEL[deal.airline]}
                    </span>
                    {deal.source === "ryanair-file" ? <Badge variant="outline">aktualna cena Ryanair</Badge> : null}
                    {deal.source === "wizz-file" ? <Badge variant="outline">aktualna cena Wizz</Badge> : null}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Wylot: {deal.pricedOutbound ? formatDate(deal.pricedOutbound) : formatTripDates(deal.route.outboundFrom, deal.route.outboundTo)}
                    {deal.pricedReturn
                      ? ` · powrót: ${formatDate(deal.pricedReturn)}`
                      : deal.route.returnDate
                        ? ` · powrót: ${formatDate(deal.route.returnDate)}`
                        : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="font-medium text-emerald-800 dark:text-emerald-300">
                      {deal.verdict === "book" ? "Rezerwuj teraz." : deal.verdict === "good" ? "Dobra okazja." : "Aktualna cena z pliku."}
                    </span>{" "}
                    {dealReason(deal)}
                    {!deal.fresh ? " Cena ma ponad 48 h — sprawdź ją ponownie przed zakupem." : ""}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="font-heading text-3xl font-bold tracking-wide text-brand-ink tabular-nums dark:text-ryanair-yellow">
                    {formatPln(deal.latest.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">odczyt {formatDate(deal.latest.checkedOn)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function dealReason(deal: DealRecommendation): string {
  if (deal.verdict === "current") {
    return "Najniższa potwierdzona cena w wybranym oknie dat; za mało historii na ocenę trendu.";
  }
  if (deal.percentBelowMedian != null && deal.percentBelowMedian >= 8 && deal.median != null) {
    return `${deal.percentBelowMedian}% poniżej mediany ${formatPln(deal.median)}.`;
  }
  if (deal.percentDrop != null && deal.previous) {
    return `${deal.percentDrop}% taniej niż poprzedni odczyt (${formatPln(deal.previous.amount)}).`;
  }
  return `Najniższa z ${deal.observedPrices} zapisanych cen (minimum ${formatPln(deal.historicalLow)}).`;
}

function dealWord(count: number): string {
  return count === 1 ? "okazja" : count < 5 ? "okazje" : "okazji";
}

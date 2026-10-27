"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MapPinned } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { AddRouteDialog } from "@/components/add-route-dialog";
import { CheckFareDialog } from "@/components/check-fare-dialog";
import { LogPriceDialog } from "@/components/log-price-dialog";
import { RouteCard } from "@/components/route-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTE_LIST_AS_OF, destinationByIata } from "@/lib/airports";
import { formatPln } from "@/lib/format";
import { lowestLoggedPrice, orderedLogs, priceDrop, sortRoutes } from "@/lib/routes";
import {
  clearStore,
  getServerSnapshot,
  getSnapshot,
  interpretSnapshot,
  refreshStore,
  saveStore,
  subscribe,
} from "@/lib/storage";
import type { Airline, PriceDraft, StoreData } from "@/lib/types";

export function FareBoard({ initialDestinationIata }: { initialDestinationIata?: string }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const view = interpretSnapshot(snapshot);
  const initialDestination = destinationByIata.has(initialDestinationIata ?? "") ? initialDestinationIata : undefined;
  const [addOpen, setAddOpen] = useState(initialDestination != null);
  const [addKey, setAddKey] = useState(0);
  const [addDestinationIata, setAddDestinationIata] = useState<string | undefined>(initialDestination);
  const [logRouteId, setLogRouteId] = useState<string | null>(null);
  const [logKey, setLogKey] = useState(0);
  const [check, setCheck] = useState<{
    routeId: string;
    airline: Airline;
    href: string;
    blocked: boolean;
  } | null>(null);
  const [checkKey, setCheckKey] = useState(0);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ready = view.status === "ready" ? view.data : null;
  const sorted = ready ? sortRoutes(ready.routes, ready.logs) : [];
  const priced = sorted
    .map((route) => lowestLoggedPrice(orderedLogs(ready?.logs ?? [], route.id)))
    .filter((price): price is number => price != null);
  const drops = ready
    ? ready.routes.filter((route) => priceDrop(orderedLogs(ready.logs, route.id))).length
    : 0;
  const logRoute = ready?.routes.find((route) => route.id === logRouteId) ?? null;
  const logDestination = logRoute ? destinationByIata.get(logRoute.destinationIata) : undefined;
  const checkRoute = ready?.routes.find((route) => route.id === check?.routeId) ?? null;
  const checkDestination = checkRoute ? destinationByIata.get(checkRoute.destinationIata) : undefined;
  const deleteRoute = ready?.routes.find((route) => route.id === deleteRouteId) ?? null;

  function commit(next: StoreData) {
    try {
      saveStore(next);
      setSaveError(null);
      return true;
    } catch {
      setSaveError("Nie udało się zapisać w tej przeglądarce.");
      return false;
    }
  }

  function openAdd(destinationIata?: string) {
    setAddDestinationIata(destinationIata);
    setAddKey((value) => value + 1);
    setAddOpen(true);
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(880px_380px_at_-8%_-10%,rgb(255_209_0/0.42),transparent_58%),radial-gradient(720px_420px_at_108%_-6%,rgb(198_0_126/0.2),transparent_52%)]"
      />
      <header className="bg-ryanair text-white">
        <div className="flex h-1.5" aria-hidden>
          <div className="flex-1 bg-ryanair-yellow" />
          <div className="flex-1 bg-wizz" />
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <AirlineMark airline="ryanair" />
              <AirlineMark airline="wizzair" />
              <p className="font-heading text-sm font-semibold tracking-[0.18em] text-ryanair-yellow uppercase">
                KRK · Balice
              </p>
            </div>
            <h1 className="mt-3 font-heading text-4xl leading-none font-bold tracking-wide uppercase sm:text-5xl">
              Tanie loty z Krakowa
            </h1>
            <p className="mt-3 max-w-xl text-base text-white/75">
              Ryanair i Wizz Air. Start zawsze z KRK. Ceny zapisujesz sam — historia zostaje w tej
              przeglądarce.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/mapa-polaczen" />} variant="outline" className="h-10 border-white/35 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white">
              <MapPinned /> Mapa połączeń
            </Button>
            <Button type="button" className="h-10 font-semibold" onClick={() => openAdd()} disabled={!ready}>
              Dodaj trasę
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">

        {saveError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveError}
          </p>
        ) : null}

        {view.status === "loading" ? <LoadingState /> : null}
        {view.status === "error" ? (
          <ErrorState
            kind={view.kind}
            onRetry={() => {
              refreshStore();
              setSaveError(null);
            }}
            onClear={() => {
              try {
                clearStore();
                setSaveError(null);
              } catch {
                setSaveError("Nie udało się wyczyścić zapisów w tej przeglądarce.");
              }
            }}
          />
        ) : null}

        {ready && ready.routes.length === 0 ? <EmptyState onAdd={openAdd} /> : null}

        {ready && ready.routes.length > 0 ? (
          <section className="grid gap-4" aria-label="Obserwowane trasy">
            <p className="text-sm text-muted-foreground">
              {ready.routes.length} {routeWord(ready.routes.length)}
              {priced.length > 0 ? ` · najtaniej ${formatPln(Math.min(...priced))}` : " · brak zapisanych cen"}
              {drops > 0 ? ` · ${drops} ${drops === 1 ? "obniżka" : "obniżki"}` : ""}
              . Od najniższej zapisanej ceny. Trasy bez wpisu są na końcu.
            </p>
            <div className="grid gap-4">
              {sorted.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  logs={ready.logs}
                  onLogPrice={() => {
                    setLogKey((value) => value + 1);
                    setLogRouteId(route.id);
                  }}
                  onCheck={(session) => {
                    setCheckKey((value) => value + 1);
                    setCheck({ routeId: route.id, ...session });
                  }}
                  onDeleteRoute={() => setDeleteRouteId(route.id)}
                  onDeleteLog={(logId) =>
                    commit({
                      routes: ready.routes,
                      logs: ready.logs.filter((entry) => entry.id !== logId),
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-auto border-t border-border pt-4 text-sm text-muted-foreground">
          Ceny nie pochodzą od linii. Aplikacja nie pobiera taryf i nie loguje się do żadnego konta.
          Kierunki: informator połączeń regularnych Kraków Airport, zima 2026/27, stan na{" "}
          <time dateTime={ROUTE_LIST_AS_OF}>20 października 2026</time>. Tylko Ryanair i Wizz Air.
        </footer>
      </main>

      {ready ? (
        <AddRouteDialog
          key={addKey}
          open={addOpen}
          routes={ready.routes}
          initialDestinationIata={addDestinationIata}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) setAddDestinationIata(undefined);
          }}
          onAdd={(trip) =>
            commit({
              routes: [
                ...ready.routes,
                {
                  id: crypto.randomUUID(),
                  destinationIata: trip.destinationIata,
                  outboundFrom: trip.outboundFrom,
                  outboundTo: trip.outboundTo,
                  returnDate: trip.returnDate,
                  createdAt: new Date().toISOString(),
                },
              ],
              logs: ready.logs,
            })
          }
        />
      ) : null}

      {logRoute && logDestination ? (
        <LogPriceDialog
          key={logKey}
          open
          city={`${logDestination.city} (${logDestination.iata})`}
          airlines={logDestination.airlines}
          hasReturn={logRoute.returnDate != null}
          onOpenChange={(open) => {
            if (!open) setLogRouteId(null);
          }}
          onSave={(entry) => {
            if (!ready) return false;
            return commit({
              routes: ready.routes,
              logs: [
                ...ready.logs,
                {
                  id: crypto.randomUUID(),
                  routeId: logRoute.id,
                  airline: entry.airline,
                  amount: entry.amount,
                  currency: "PLN",
                  checkedOn: entry.checkedOn,
                  outboundDepart: entry.outboundDepart,
                  outboundArrive: entry.outboundArrive,
                  returnDepart: entry.returnDepart,
                  returnArrive: entry.returnArrive,
                  createdAt: new Date().toISOString(),
                },
              ],
            });
          }}
        />
      ) : null}

      {ready && check && checkRoute && checkDestination ? (
        <CheckFareDialog
          key={checkKey}
          route={checkRoute}
          city={`${checkDestination.city} (${checkDestination.iata})`}
          airline={check.airline}
          href={check.href}
          logs={ready.logs}
          popupBlocked={check.blocked}
          onOpenChange={(open) => {
            if (!open) setCheck(null);
          }}
          onSave={(entry) =>
            commit({
              routes: ready.routes,
              logs: [
                ...ready.logs,
                {
                  id: crypto.randomUUID(),
                  routeId: checkRoute.id,
                  airline: entry.airline,
                  amount: entry.amount,
                  currency: "PLN",
                  checkedOn: entry.checkedOn,
                  outboundDepart: entry.outboundDepart,
                  outboundArrive: entry.outboundArrive,
                  returnDepart: entry.returnDepart,
                  returnArrive: entry.returnArrive,
                  createdAt: new Date().toISOString(),
                },
              ],
            })
          }
        />
      ) : null}

      <Dialog open={deleteRoute != null} onOpenChange={(open) => !open && setDeleteRouteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usunąć tę trasę?</DialogTitle>
            <DialogDescription>
              {deleteRoute
                ? `${destinationByIata.get(deleteRoute.destinationIata)?.city ?? deleteRoute.destinationIata} zniknie razem z historią cen. Zostaje to tylko w tej przeglądarce.`
                : "Trasa zniknie razem z historią cen."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteRouteId(null)}>
              Zostaw
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!ready || !deleteRoute) return;
                const removed = commit({
                  routes: ready.routes.filter((route) => route.id !== deleteRoute.id),
                  logs: ready.logs.filter((entry) => entry.routeId !== deleteRoute.id),
                });
                if (removed) setDeleteRouteId(null);
              }}
            >
              Usuń trasę
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function routeWord(count: number) {
  if (count === 1) return "trasa";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "trasy";
  return "tras";
}

function LoadingState() {
  return (
    <section aria-busy="true" aria-live="polite" className="grid gap-3">
      <p className="text-sm text-muted-foreground">Wczytuję zapisane trasy…</p>
      <div className="grid gap-4">
        {[0, 1].map((item) => (
          <div key={item} className="animate-pulse rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-7 w-48 rounded bg-muted" />
            <div className="mt-6 h-10 w-36 rounded bg-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="rounded-2xl bg-card px-5 py-10 text-center ring-1 ring-foreground/10">
      <div className="mb-4 flex items-center justify-center gap-3">
        <AirlineMark airline="ryanair" className="size-11" />
        <span className="font-heading text-3xl font-bold tracking-wide text-ryanair">KRK</span>
        <AirlineMark airline="wizzair" className="size-11" />
      </div>
      <h2 className="font-heading text-2xl font-medium">Nie obserwujesz jeszcze żadnej trasy</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Dodaj kierunek z Krakowa. „Sprawdź dziś” otworzy wyszukiwarkę linii w osobnym oknie i formularz
        zapisu ceny. Kwota trafia od razu do historii w tej przeglądarce.
      </p>
      <Button type="button" className="mt-5 h-10" onClick={onAdd}>
        Dodaj trasę
      </Button>
    </section>
  );
}

function ErrorState({
  kind,
  onRetry,
  onClear,
}: {
  kind: "blocked" | "corrupt";
  onRetry: () => void;
  onClear: () => void;
}) {
  return (
    <section role="alert" className="rounded-2xl bg-card px-5 py-8 ring-1 ring-destructive/30">
      <h2 className="font-heading text-2xl font-medium">Nie udało się odczytać zapisów</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        {kind === "blocked"
          ? "Ta przeglądarka blokuje pamięć strony, więc lista tras się nie otworzy. Historia cen jest trzymana lokalnie i nie ma jej na serwerze."
          : "Zapis w tej przeglądarce jest uszkodzony. Możesz go wyczyścić i zacząć od nowa. Kopii na serwerze nie ma."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {kind === "corrupt" ? (
          <Button type="button" variant="destructive" onClick={onClear}>
            Wyczyść lokalne dane
          </Button>
        ) : (
          <Button type="button" onClick={onRetry}>
            Spróbuj ponownie
          </Button>
        )}
      </div>
    </section>
  );
}

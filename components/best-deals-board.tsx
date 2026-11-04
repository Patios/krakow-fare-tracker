"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, MapPinned, Ticket } from "lucide-react";
import { AccountDialog } from "@/components/account-dialog";
import { AirlineMark } from "@/components/airline-mark";
import { BestDeals } from "@/components/best-deals";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AIRLINE_HOME_URL, AIRLINE_LABEL } from "@/lib/airports";
import { getCloudServerSnapshot, getCloudSnapshot, startCloudSync, subscribeCloud } from "@/lib/cloud";
import { bestDeals } from "@/lib/deals";
import { todayIso } from "@/lib/format";
import { getServerSnapshot, getSnapshot, interpretSnapshot, subscribe } from "@/lib/storage";
import { getWizzServerSnapshot, getWizzSnapshot, subscribeWizz } from "@/lib/wizz-data";

const headerButton =
  "h-9 border-white/35 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white dark:border-white/35! dark:bg-white/10! dark:text-white! dark:hover:bg-white/20! dark:hover:text-white!";

export function BestDealsBoard() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot, getCloudServerSnapshot);
  const wizz = useSyncExternalStore(subscribeWizz, getWizzSnapshot, getWizzServerSnapshot);
  const view = interpretSnapshot(snapshot);
  const ready = view.status === "ready" ? view.data : null;
  const deals = ready ? bestDeals(ready.routes, ready.logs, todayIso(), { wizz }) : [];

  useEffect(() => startCloudSync(), []);

  return (
    <div className="relative isolate flex flex-1 flex-col">
      <header className="bg-ryanair text-white">
        <div className="flex h-1.5" aria-hidden>
          <div className="flex-1 bg-ryanair-yellow" />
          <div className="flex-1 bg-wizz" />
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(["ryanair", "wizzair"] as const).map((airline) => (
                <a
                  key={airline}
                  href={AIRLINE_HOME_URL[airline]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Strona główna ${AIRLINE_LABEL[airline]}`}
                  className="rounded-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <AirlineMark airline={airline} />
                </a>
              ))}
              <p className="font-heading text-sm font-semibold tracking-[0.18em] text-ryanair-yellow uppercase">KRK · Balice</p>
            </div>
            <nav aria-label="Narzędzia" className="flex min-w-0 items-center gap-2 max-sm:[&_[data-label]]:hidden">
              <Button nativeButton={false} render={<Link href="/" aria-label="Obserwowane trasy" />} variant="outline" className={headerButton}>
                <ArrowLeft /> <span data-label>Trasy</span>
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/mapa-polaczen" aria-label="Mapa połączeń" />}
                variant="outline"
                className={headerButton}
              >
                <MapPinned /> <span data-label>Mapa połączeń</span>
              </Button>
              <Button nativeButton={false} render={<Link href="/rezerwacje" aria-label="Rezerwacje" />} variant="outline" className={headerButton}>
                <Ticket /> <span data-label>Rezerwacje</span>
              </Button>
              <ThemeToggle className="h-9" />
              <AccountDialog />
            </nav>
          </div>
          <h1 className="mt-5 font-heading text-4xl leading-none font-bold tracking-wide uppercase sm:text-5xl">Najlepsze okazje</h1>
          <p className="mt-3 max-w-2xl text-base text-white/75">
            Rekomendacje dla wylotów z KRK w ciągu najbliższych 31 dni, wyliczone z historii cen i aktualnego pliku Wizz Air.
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {cloud.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {cloud.error}
          </p>
        ) : null}
        {cloud.syncing ? <p className="text-sm text-muted-foreground">Synchronizuję ceny z kontem…</p> : null}
        {view.status === "loading" ? <p className="text-sm text-muted-foreground">Wczytuję zapisane ceny…</p> : null}
        {view.status === "error" ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-6 text-sm text-destructive">
            Przeglądarka nie pozwala odczytać zapisanych cen. Wróć do tras i spróbuj odświeżyć dane.
          </p>
        ) : null}
        {ready && ready.routes.length === 0 ? (
          <section className="grid justify-items-start gap-3 rounded-xl bg-card px-4 py-6 ring-1 ring-foreground/10">
            <h2 className="font-heading text-xl font-semibold">Nie obserwujesz jeszcze tras</h2>
            <p className="text-sm text-muted-foreground">Dodaj trasę i zapisz przynajmniej dwa odczyty ceny, aby otrzymać rekomendację.</p>
            <Button nativeButton={false} render={<Link href="/" />}>Wróć do tras</Button>
          </section>
        ) : null}
        {ready && ready.routes.length > 0 ? <BestDeals deals={deals} /> : null}
      </main>
    </div>
  );
}

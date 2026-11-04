"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AIRLINE_LABEL, destinationByIata } from "@/lib/airports";
import { formatDate, formatLegPrices, formatPln, formatTripDates } from "@/lib/format";
import { orderedLogs } from "@/lib/routes";
import { getServerSnapshot, getSnapshot, interpretSnapshot, refreshStore, subscribe } from "@/lib/storage";
import type { PriceLog, WatchedRoute } from "@/lib/types";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 10;

const savedAtFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ArchivePage() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const view = interpretSnapshot(snapshot);
  const [activeTab, setActiveTab] = useState<"all" | "recent">("all");

  const ready = view.status === "ready" ? view.data : null;
  const routes = ready?.routes ?? [];
  const logs = ready?.logs ?? [];
  const ordered = [...routes].sort(byRecentActivity(logs));
  const visible = activeTab === "recent" ? ordered.slice(0, RECENT_LIMIT) : ordered;
  const destinations = new Set(routes.map((route) => route.destinationIata)).size;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Wróć do głównego panelu
        </Link>
        <h1 className="font-heading text-3xl font-bold">Archiwum tras</h1>
      </div>

      {view.status === "loading" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Wczytuję zapisane trasy
        </p>
      ) : null}

      {view.status === "error" ? <ErrorState kind={view.kind} /> : null}

      {ready ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Stat value={routes.length} label="Obserwowanych tras" />
            <Stat value={logs.length} label="Zapisanych cen" />
            <Stat value={destinations} label="Unikalnych destynacji" />
          </div>

          <div className="flex border-b" role="tablist" aria-label="Zakres archiwum">
            <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
              Wszystkie trasy
            </TabButton>
            <TabButton active={activeTab === "recent"} onClick={() => setActiveTab("recent")}>
              Ostatnie trasy
            </TabButton>
          </div>

          {visible.length > 0 ? (
            <div className="space-y-6">
              {visible.map((route) => (
                <RouteArchiveCard key={route.id} route={route} logs={orderedLogs(logs, route.id)} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Brak zapisanych tras.
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

function byRecentActivity(logs: PriceLog[]) {
  return (a: WatchedRoute, b: WatchedRoute) => {
    const left = orderedLogs(logs, a.id)[0]?.createdAt ?? a.createdAt;
    const right = orderedLogs(logs, b.id)[0]?.createdAt ?? b.createdAt;
    if (left !== right) return left < right ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  };
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return savedAtFormatter.format(date);
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card>
      <CardContent>
        <div className="font-heading text-2xl font-bold">{value}</div>
        <div className="text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "border-b-2 px-4 py-2 text-sm font-medium",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ErrorState({ kind }: { kind: "blocked" | "corrupt" }) {
  return (
    <section role="alert" className="rounded-2xl bg-card px-5 py-8 ring-1 ring-destructive/30">
      <h2 className="font-heading text-2xl font-medium">Nie udało się odczytać zapisów</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        {kind === "blocked"
          ? "Ta przeglądarka blokuje pamięć strony, więc archiwum się nie otworzy."
          : "Zapis w tej przeglądarce jest uszkodzony. Wróć do panelu, żeby go odczytać albo wyczyścić."}
      </p>
      {kind === "blocked" ? (
        <Button type="button" className="mt-5" onClick={() => refreshStore()}>
          Spróbuj ponownie
        </Button>
      ) : null}
    </section>
  );
}

function RouteArchiveCard({ route, logs }: { route: WatchedRoute; logs: PriceLog[] }) {
  const latest = logs[0];
  const city = destinationByIata.get(route.destinationIata)?.city ?? route.destinationIata;
  const legs = latest ? formatLegPrices(latest) : null;
  const savedAt = latest ? formatSavedAt(latest.createdAt) : "";

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-xl font-bold">
              {city} ({route.destinationIata})
            </h2>
            <p className="mt-1 text-muted-foreground">
              Wylot {formatTripDates(route.outboundFrom, route.outboundTo)}
              {" – "}
              {route.returnDate ? `powrót ${formatDate(route.returnDate)}` : "w jedną stronę"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {latest ? formatPln(latest.amount) : "Brak zapisanej ceny"}
            </div>
            {legs ? <div className="text-sm text-muted-foreground">{legs}</div> : null}
            {savedAt ? <div className="text-sm text-muted-foreground">Zapisano {savedAt}</div> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-6">
        <h3 className="mb-3 font-medium">Historia cen</h3>
        {logs.length > 0 ? (
          <div className="space-y-3">
            {logs.map((log) => {
              const when = formatSavedAt(log.createdAt);
              const split = formatLegPrices(log);
              return (
                <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Calendar className="size-4" />
                    </div>
                    <div>
                      <div className="font-medium">{formatPln(log.amount)}</div>
                      {split ? <div className="text-sm text-muted-foreground">{split}</div> : null}
                      <div className="text-sm text-muted-foreground">
                        {AIRLINE_LABEL[log.airline]} sprawdzono {formatDate(log.checkedOn)}
                      </div>
                    </div>
                  </div>
                  {when ? <div className="text-right text-xs text-muted-foreground">Zapisano {when}</div> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Brak zapisanej ceny dla tej trasy.</p>
        )}
      </CardContent>
    </Card>
  );
}

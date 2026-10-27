"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AIRLINE_HOME_URL, AIRLINE_LABEL, ROUTE_LIST_AS_OF, RYANAIR_IATA, destinationByIata } from "@/lib/airports";
import { formatDate, todayIso } from "@/lib/format";
import {
  getNetworkServerSnapshot,
  getNetworkSnapshot,
  loadRyanairNetwork,
  parseNetworkSnapshot,
  saveNetwork,
  subscribeNetwork,
} from "@/lib/network-refresh";
import { krakowPoint, mappedRoutes, withLiveRyanair } from "@/lib/route-map";
import type { Airline } from "@/lib/types";

const color: Record<Airline, string> = { ryanair: "#ffd100", wizzair: "#c6007e" };

export function ConnectionMap() {
  const router = useRouter();
  const [enabledAirlines, setEnabledAirlines] = useState<Airline[]>(["ryanair", "wizzair"]);
  const [activeRouteIata, setActiveRouteIata] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const network = parseNetworkSnapshot(
    useSyncExternalStore(subscribeNetwork, getNetworkSnapshot, getNetworkServerSnapshot),
  );
  const live = network ? withLiveRyanair(network.airports) : { routes: mappedRoutes, unplaced: [] };
  const newIatas = new Set(live.routes.filter((route) => !destinationByIata.has(route.iata)).map((route) => route.iata));
  const visibleRoutes = live.routes.filter((route) =>
    route.airlines.some((airline) => enabledAirlines.includes(airline)),
  );
  const airlineCount = {
    ryanair: live.routes.filter((route) => route.airlines.includes("ryanair")).length,
    wizzair: live.routes.filter((route) => route.airlines.includes("wizzair")).length,
  };
  const missingFromSale = network
    ? RYANAIR_IATA.filter((iata) => !network.airports.some((airport) => airport.iata === iata))
    : [];

  async function refreshNetwork() {
    setRefreshing(true);
    setRefreshError("");
    try {
      const result = await loadRyanairNetwork(todayIso());
      if (!result.ok) {
        setRefreshError(
          result.reason === "blocked"
            ? "Przeglądarka nie dostała odpowiedzi od Ryanair."
            : "Ryanair nie zwrócił czytelnej siatki połączeń.",
        );
        return;
      }
      saveNetwork(result.snapshot);
    } catch {
      setRefreshError("Nie udało się pobrać siatki z Ryanair.");
    } finally {
      setRefreshing(false);
    }
  }

  function toggleAirline(airline: Airline) {
    setEnabledAirlines((current) =>
      current.includes(airline) ? current.filter((item) => item !== airline) : [...current, airline],
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#071b43] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(900px_520px_at_50%_42%,#174d95_0%,transparent_66%)]" />
      <header className="relative z-10 border-b border-white/15">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-white/80 transition-colors hover:text-white">
            <ArrowLeft className="size-4" /> Wróć do obserwowanych tras
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle className="h-9" />
            <div className="flex items-center gap-2" aria-hidden>
              <AirlineMark airline="ryanair" className="size-7" />
              <AirlineMark airline="wizzair" className="size-7" />
            </div>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
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
              <span className="font-heading text-sm font-semibold tracking-[0.18em] text-ryanair-yellow uppercase">KRK · Balice</span>
            </div>
            <h1 className="mt-2 font-heading text-4xl font-bold tracking-wide uppercase sm:text-5xl">Mapa połączeń</h1>
            <p className="mt-2 max-w-xl text-white/70">Regularne kierunki z Krakowa. Mapa pokazuje zasięg tras, a poniżej znajdziesz pełną, czytelną listę miast i przewoźników.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-white/65">Pokaż połączenia:</span>
            <AirlineFilter airline="ryanair" count={airlineCount.ryanair} active={enabledAirlines.includes("ryanair")} onToggle={toggleAirline} />
            <AirlineFilter airline="wizzair" count={airlineCount.wizzair} active={enabledAirlines.includes("wizzair")} onToggle={toggleAirline} />
            <button
              type="button"
              onClick={() => void refreshNetwork()}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/22 px-3 font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
            >
              <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
              {refreshing ? "Pobieram siatkę…" : "Odśwież siatkę"}
            </button>
          </div>
        </div>
        {refreshError ? (
          <p role="alert" className="mt-4 text-sm text-ryanair-yellow">
            {refreshError}
          </p>
        ) : null}
        {network ? (
          <p className="mt-4 max-w-3xl text-sm text-white/75" role="status">
            Ryanair sprzedaje bilety do {network.airports.length} lotnisk z KRK do {formatDate(network.through)}.
            {newIatas.size + live.unplaced.length > 0
              ? ` Nowe względem zimowego rozkładu: ${[
                  ...[...newIatas].map((iata) => live.routes.find((route) => route.iata === iata)?.city ?? iata),
                  ...live.unplaced.map((airport) => airport.city),
                ].join(", ")}.`
              : " Nie ma kierunków spoza zimowego rozkładu."}
            {missingFromSale.length > 0
              ? ` Bez biletów w tym oknie: ${missingFromSale.map((iata) => destinationByIata.get(iata)?.city ?? iata).join(", ")}. Zostają na mapie.`
              : " Wszystkie kierunki z zimowego rozkładu nadal mają bilety."}
          </p>
        ) : null}
        <section className="mt-7 rounded-2xl border border-white/15 bg-[#0b2a61]/70 p-2 shadow-2xl shadow-black/25 sm:p-4" aria-label="Mapa tras z Krakowa">
          <div className="connection-map relative aspect-[1.55/1] overflow-hidden rounded-xl border border-white/10 bg-[#082454]">
            <div aria-hidden className="absolute inset-0 opacity-30 [background-image:linear-gradient(#7db0dc22_1px,transparent_1px),linear-gradient(90deg,#7db0dc22_1px,transparent_1px)] [background-size:10%_12.82%]" />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-center"
              style={{ backgroundImage: `url('${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/europe-map.svg')`, backgroundSize: "100% 100%" }}
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" role="img" aria-label="Schemat połączeń lotniczych z Krakowa">
              <defs><linearGradient id="both-airlines" x1="0" x2="1"><stop stopColor="#ffd100" /><stop offset="1" stopColor="#c6007e" /></linearGradient></defs>
              {visibleRoutes.map((route) => (
                <RouteLine
                  key={route.iata}
                  route={route}
                  enabledAirlines={enabledAirlines}
                  highlighted={activeRouteIata === route.iata}
                  dimmed={activeRouteIata != null && activeRouteIata !== route.iata}
                  onHover={setActiveRouteIata}
                  onSelect={(iata) => router.push(`/?destination=${iata}`)}
                />
              ))}
              <circle cx={krakowPoint.x} cy={krakowPoint.y} r="1.45" fill="#fff" stroke="#ffd100" strokeWidth=".6" />
              <text x={krakowPoint.x + 1.8} y={krakowPoint.y - 1.3} fill="white" fontSize="2.2" fontWeight="700">KRAKÓW</text>
            </svg>
            <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-[#061936]/85 px-2 py-1 text-[10px] font-semibold tracking-wide text-white/70">MAPA POŁĄCZEŃ Z KRAKOWA</div>
          </div>
        </section>
        <section className="mt-7" aria-labelledby="destinations-heading">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 id="destinations-heading" className="font-heading text-2xl font-semibold tracking-wide uppercase">Kierunki z Krakowa</h2>
            <p className="text-sm text-white/60">{visibleRoutes.length} z {mappedRoutes.length} miast · kolory odpowiadają filtrom</p>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Lista miast docelowych">
            {visibleRoutes.map((route) => (
              <li key={route.iata}>
                <Link
                  href={`/?destination=${route.iata}`}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${activeRouteIata === route.iata ? "border-ryanair-yellow bg-white/15" : "border-white/10 bg-white/5"}`}
                  onMouseEnter={() => setActiveRouteIata(route.iata)}
                  onMouseLeave={() => setActiveRouteIata(null)}
                >
                  <span className="min-w-0"><span className="block truncate font-medium text-white">{route.city}{newIatas.has(route.iata) ? " · nowy" : ""}</span><span className="block truncate text-xs text-white/55">{route.country} · {route.iata}</span></span>
                  <span className="flex shrink-0 gap-1" aria-label={route.airlines.map((airline) => AIRLINE_LABEL[airline]).join(" i ")}>
                    {route.airlines.filter((airline) => enabledAirlines.includes(airline)).map((airline) => <span key={airline} className="size-2.5 rounded-full" style={{ backgroundColor: color[airline] }} />)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {visibleRoutes.length === 0 ? <p className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">Włącz co najmniej jedną linię, aby zobaczyć połączenia.</p> : null}
          {live.unplaced.length > 0 ? (
            <p className="mt-4 text-sm text-white/70">
              Bez punktu na mapie: {live.unplaced.map((airport) => `${airport.city} (${airport.iata})`).join(", ")}. Te kierunki są w wyszukiwarce po odświeżeniu.
            </p>
          ) : null}
        </section>
        <div className="mt-6 flex flex-col justify-between gap-4 border-t border-white/15 pt-5 text-sm text-white/65 sm:flex-row sm:items-center">
          <p>
            {network ? (
              <>
                Ryanair sprawdzony <time dateTime={network.checkedAt}>{formatChecked(network.checkedAt)}</time>. Wizz Air zostaje z zimowego rozkładu z{" "}
                <time dateTime={ROUTE_LIST_AS_OF}>20 października 2026</time>, bo jego siatki nie da się odczytać z przeglądarki.
              </>
            ) : (
              <>
                Stan siatki połączeń: <time dateTime={ROUTE_LIST_AS_OF}>20 października 2026</time>. „Odśwież siatkę” pyta Ryanair o bilety na najbliższe 6 miesięcy.
              </>
            )}
          </p>
          <Button nativeButton={false} render={<Link href="/" />} className="h-9 self-start">Przejdź do cen</Button>
        </div>
      </main>
    </div>
  );
}

function routeCountWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return "trasa";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "trasy";
  return "tras";
}

function formatChecked(iso: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function AirlineFilter({
  airline,
  count,
  active,
  onToggle,
}: {
  airline: Airline;
  count: number;
  active: boolean;
  onToggle: (airline: Airline) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(airline)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={{
        borderColor: active ? color[airline] : "rgb(255 255 255 / 0.22)",
        backgroundColor: active ? `${color[airline]}22` : "transparent",
        color: active ? "white" : "rgb(255 255 255 / 0.55)",
      }}
    >
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color[airline] }} />
      {AIRLINE_LABEL[airline]} · {count} {routeCountWord(count)}
    </button>
  );
}

function RouteLine({
  route,
  enabledAirlines,
  highlighted,
  dimmed,
  onHover,
  onSelect,
}: {
  route: (typeof mappedRoutes)[number];
  enabledAirlines: Airline[];
  highlighted: boolean;
  dimmed: boolean;
  onHover: (iata: string | null) => void;
  onSelect: (iata: string) => void;
}) {
  const visibleAirlines = route.airlines.filter((airline) => enabledAirlines.includes(airline));
  const hasBoth = visibleAirlines.length === 2;
  const stroke = hasBoth ? "url(#both-airlines)" : color[visibleAirlines[0]];
  const path = `M ${krakowPoint.x} ${krakowPoint.y} Q ${(krakowPoint.x + route.x) / 2} ${Math.min(krakowPoint.y, route.y) - 3} ${route.x} ${route.y}`;
  return (
    <g
      role="link"
      tabIndex={0}
      aria-label={`Dodaj trasę do miasta ${route.city}`}
      onClick={() => onSelect(route.iata)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(route.iata);
        }
      }}
      onMouseEnter={() => onHover(route.iata)}
      onMouseLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      <path d={path} fill="none" stroke="transparent" strokeWidth="2.5" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={highlighted ? ".7" : ".28"} strokeOpacity={dimmed ? ".12" : highlighted ? "1" : ".7"} className="transition-all duration-150" />
      <g><title>{`${route.city} (${route.iata}), ${route.country}: ${visibleAirlines.map((airline) => AIRLINE_LABEL[airline]).join(" i ")}`}</title>
        {hasBoth ? <><circle cx={route.x} cy={route.y} r={highlighted ? "1.2" : ".72"} fill="#ffd100" opacity={dimmed ? ".25" : "1"} /><path d={`M ${route.x} ${route.y - (highlighted ? 1.2 : .72)} A ${highlighted ? 1.2 : .72} ${highlighted ? 1.2 : .72} 0 0 1 ${route.x} ${route.y + (highlighted ? 1.2 : .72)} Z`} fill="#c6007e" opacity={dimmed ? ".25" : "1"} /></> : <circle cx={route.x} cy={route.y} r={highlighted ? "1.2" : ".72"} fill={stroke} opacity={dimmed ? ".25" : "1"} />}
      </g>
      {highlighted ? <text x={route.x + 1.4} y={route.y - 1.2} fill="white" fontSize="1.9" fontWeight="700" paintOrder="stroke" stroke="#061936" strokeWidth=".8">{route.city}</text> : null}
    </g>
  );
}

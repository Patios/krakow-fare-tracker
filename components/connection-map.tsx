"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPinned } from "lucide-react";
import { AirlineMark } from "@/components/airline-mark";
import { Button } from "@/components/ui/button";
import { AIRLINE_LABEL, ROUTE_LIST_AS_OF } from "@/lib/airports";
import { airlineRouteCount, krakowPoint, mappedRoutes } from "@/lib/route-map";
import type { Airline } from "@/lib/types";

const color: Record<Airline, string> = { ryanair: "#ffd100", wizzair: "#c6007e" };

export function ConnectionMap() {
  const router = useRouter();
  const [enabledAirlines, setEnabledAirlines] = useState<Airline[]>(["ryanair", "wizzair"]);
  const [activeRouteIata, setActiveRouteIata] = useState<string | null>(null);
  const visibleRoutes = mappedRoutes.filter((route) =>
    route.airlines.some((airline) => enabledAirlines.includes(airline)),
  );

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
            <AirlineMark airline="ryanair" className="size-7" />
            <AirlineMark airline="wizzair" className="size-7" />
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-ryanair-yellow"><MapPinned className="size-5" /><span className="font-heading text-sm font-semibold tracking-[0.18em] uppercase">KRK · Balice</span></div>
            <h1 className="mt-2 font-heading text-4xl font-bold tracking-wide uppercase sm:text-5xl">Mapa połączeń</h1>
            <p className="mt-2 max-w-xl text-white/70">Regularne kierunki z Krakowa. Mapa pokazuje zasięg tras, a poniżej znajdziesz pełną, czytelną listę miast i przewoźników.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-white/65">Pokaż połączenia:</span>
            <AirlineFilter airline="ryanair" active={enabledAirlines.includes("ryanair")} onToggle={toggleAirline} />
            <AirlineFilter airline="wizzair" active={enabledAirlines.includes("wizzair")} onToggle={toggleAirline} />
          </div>
        </div>
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
                  <span className="min-w-0"><span className="block truncate font-medium text-white">{route.city}</span><span className="block truncate text-xs text-white/55">{route.country} · {route.iata}</span></span>
                  <span className="flex shrink-0 gap-1" aria-label={route.airlines.map((airline) => AIRLINE_LABEL[airline]).join(" i ")}>
                    {route.airlines.filter((airline) => enabledAirlines.includes(airline)).map((airline) => <span key={airline} className="size-2.5 rounded-full" style={{ backgroundColor: color[airline] }} />)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {visibleRoutes.length === 0 ? <p className="mt-4 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">Włącz co najmniej jedną linię, aby zobaczyć połączenia.</p> : null}
        </section>
        <div className="mt-6 flex flex-col justify-between gap-4 border-t border-white/15 pt-5 text-sm text-white/65 sm:flex-row sm:items-center">
          <p>Stan siatki połączeń: <time dateTime={ROUTE_LIST_AS_OF}>20 października 2026</time>. Tylko Ryanair i Wizz Air.</p>
          <Button nativeButton={false} render={<Link href="/" />} className="h-9 self-start">Przejdź do cen</Button>
        </div>
      </main>
    </div>
  );
}

function AirlineFilter({ airline, active, onToggle }: { airline: Airline; active: boolean; onToggle: (airline: Airline) => void }) {
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
      {AIRLINE_LABEL[airline]} · {airlineRouteCount[airline]} tras
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

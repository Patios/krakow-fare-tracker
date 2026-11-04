"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ListChecks,
  MapPinned,
  Pencil,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AccountDialog } from "@/components/account-dialog";
import { AirlineChip, AirlineMark } from "@/components/airline-mark";
import { BookingDialog } from "@/components/booking-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { AIRLINE_HOME_URL, AIRLINE_LABEL } from "@/lib/airports";
import {
  getBookingCloudServerSnapshot,
  getBookingCloudSnapshot,
  persistBooking,
  removeBookingRow,
  subscribeBookingCloud,
  syncBookings,
} from "@/lib/booking-cloud";
import {
  bookingFlown,
  daysUntilLabel,
  nextBookingLeg,
  getBookingsServerSnapshot,
  getBookingsSnapshot,
  interpretBookings,
  readLocalBookings,
  saveBookings,
  splitBookings,
  subscribeBookings,
  type Booking,
  type BookingDraft,
  type BookingLeg,
  type LegCheck,
  type ScheduledFlight,
} from "@/lib/bookings";
import { getCloudServerSnapshot, getCloudSnapshot, startCloudSync, subscribeCloud } from "@/lib/cloud";
import { acceptSchedule, checkBooking } from "@/lib/flight-schedule";
import { flightClock, formatFlightDay, formatPln, todayIso } from "@/lib/format";
import { lookupDestination } from "@/lib/network-refresh";
import { cn } from "@/lib/utils";
import { getWizzServerSnapshot, getWizzSnapshot, readWizz, subscribeWizz } from "@/lib/wizz-data";

const STALE_CHECK_MS = 6 * 60 * 60 * 1000;
const headerButton =
  "h-9 border-white/35 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white dark:border-white/35! dark:bg-white/10! dark:text-white! dark:hover:bg-white/20! dark:hover:text-white!";

export function BookingsBoard() {
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot, getCloudServerSnapshot);
  const bookingCloud = useSyncExternalStore(subscribeBookingCloud, getBookingCloudSnapshot, getBookingCloudServerSnapshot);
  const view = interpretBookings(useSyncExternalStore(subscribeBookings, getBookingsSnapshot, getBookingsServerSnapshot));
  const wizz = useSyncExternalStore(subscribeWizz, getWizzSnapshot, getWizzServerSnapshot);
  const [dialog, setDialog] = useState<{ key: number; booking: Booking | null } | null>(null);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showFlown, setShowFlown] = useState(false);
  const autoChecked = useRef(false);
  const userId = cloud.auth.status === "signed-in" ? cloud.auth.userId : null;
  const today = todayIso();
  const bookings = view.status === "ready" ? view.bookings : [];
  const { upcoming, flown } = splitBookings(bookings, today);

  useEffect(() => startCloudSync(), []);

  useEffect(() => {
    if (userId) void syncBookings(userId);
  }, [userId]);

  function update(next: Booking) {
    saveBookings(readLocalBookings().map((item) => (item.id === next.id ? next : item)));
    void persistBooking(next);
  }

  async function refresh(ids: string[]) {
    const targets = readLocalBookings().filter((booking) => ids.includes(booking.id) && !bookingFlown(booking, todayIso()));
    if (targets.length === 0) return;
    setRefreshing((current) => new Set([...current, ...targets.map((booking) => booking.id)]));
    await Promise.all(
      targets.map(async (booking) => {
        const lastCheck = await checkBooking(booking, readWizz());
        const latest = readLocalBookings().find((item) => item.id === booking.id);
        if (latest) update({ ...latest, lastCheck });
        setRefreshing((current) => {
          const next = new Set(current);
          next.delete(booking.id);
          return next;
        });
      }),
    );
  }

  useEffect(() => {
    if (autoChecked.current || view.status !== "ready" || bookingCloud.syncing) return;
    if (cloud.auth.status === "loading") return;
    if (!wizz && upcoming.some((booking) => booking.airline === "wizzair")) return;
    autoChecked.current = true;
    const stale = upcoming.filter(
      (booking) => !booking.lastCheck || Date.now() - Date.parse(booking.lastCheck.checkedAt) > STALE_CHECK_MS,
    );
    if (stale.length > 0) window.setTimeout(() => void refresh(stale.map((booking) => booking.id)), 0);
  });

  function save(draft: BookingDraft, editing: Booking | null) {
    const booking: Booking = editing
      ? { ...editing, ...draft, lastCheck: null }
      : { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), lastCheck: null };
    saveBookings(editing ? readLocalBookings().map((item) => (item.id === booking.id ? booking : item)) : [...readLocalBookings(), booking]);
    void persistBooking(booking);
    void refresh([booking.id]);
  }

  function remove(id: string) {
    saveBookings(readLocalBookings().filter((item) => item.id !== id));
    void removeBookingRow(id);
    setPendingDelete(null);
  }

  const ready = view.status === "ready";

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
                  className="rounded-md transition-transform hover:scale-105"
                >
                  <AirlineMark airline={airline} />
                </a>
              ))}
              <p className="font-heading text-sm font-semibold tracking-[0.18em] text-ryanair-yellow uppercase">KRK · Balice</p>
            </div>
            <nav aria-label="Narzędzia" className="flex min-w-0 items-center gap-2 max-sm:[&_[data-label]]:hidden">
              <Button nativeButton={false} render={<Link href="/" aria-label="Obserwowane trasy" />} variant="outline" className={headerButton}>
                <ListChecks /> <span data-label>Trasy</span>
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/mapa-polaczen" aria-label="Mapa połączeń" />}
                variant="outline"
                className={headerButton}
              >
                <MapPinned /> <span data-label>Mapa</span>
              </Button>
              <ThemeToggle className="h-9" />
              <AccountDialog />
            </nav>
          </div>
          <h1 className="mt-5 font-heading text-4xl leading-none font-bold tracking-wide uppercase sm:text-5xl">Rezerwacje</h1>
          <p className="mt-3 max-w-2xl text-base text-white/75">
            Kupione loty z KRK. „Odśwież” porównuje je z aktualnym rozkładem linii i pokazuje zmiany godzin.{" "}
            {userId && !bookingCloud.error
              ? "Rezerwacje są na Twoim koncie Supabase."
              : userId
                ? "Na razie zostają w tej przeglądarce."
                : "Bez logowania zostają w tej przeglądarce."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              className="h-11 px-4 text-base font-semibold"
              disabled={!ready}
              onClick={() => setDialog({ key: Date.now(), booking: null })}
            >
              <Plus /> Dodaj rezerwację
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(headerButton, "h-11 px-4 text-base")}
              disabled={!ready || upcoming.length === 0 || refreshing.size > 0}
              onClick={() => void refresh(upcoming.map((booking) => booking.id))}
            >
              <RefreshCw className={refreshing.size > 0 ? "animate-spin" : undefined} /> Odśwież wszystkie
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        {bookingCloud.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {bookingCloud.error}
          </p>
        ) : null}
        {view.status === "error" ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Przeglądarka nie pozwala odczytać zapisanych rezerwacji.
          </p>
        ) : null}

        {ready && bookings.length === 0 ? (
          <Card>
            <CardContent className="grid justify-items-start gap-3 py-6">
              <p className="font-heading text-xl font-semibold">Nie masz jeszcze rezerwacji</p>
              <p className="text-sm text-muted-foreground">
                Dodaj kupiony lot. Wybierz dzień, a potem kliknij lot z rozkładu, żeby numer i godziny wpisały się same.
              </p>
              <Button type="button" onClick={() => setDialog({ key: Date.now(), booking: null })}>
                <Plus /> Dodaj rezerwację
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {upcoming.length > 0 ? (
          <section aria-labelledby="upcoming-title" className="grid gap-4">
            <h2 id="upcoming-title" className="font-heading text-xl font-semibold tracking-wide">
              Nadchodzące · {upcoming.length}
            </h2>
            {upcoming.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                today={today}
                wizzCheckedAt={wizz?.checkedAt ?? null}
                refreshing={refreshing.has(booking.id)}
                pendingDelete={pendingDelete === booking.id}
                onRefresh={() => void refresh([booking.id])}
                onAccept={() => update(acceptSchedule(booking))}
                onEdit={() => setDialog({ key: Date.now(), booking })}
                onDelete={() => (pendingDelete === booking.id ? remove(booking.id) : setPendingDelete(booking.id))}
                onCancelDelete={() => setPendingDelete(null)}
              />
            ))}
          </section>
        ) : null}

        {flown.length > 0 ? (
          <section aria-labelledby="flown-title" className="grid gap-4">
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start px-0 font-heading text-xl font-semibold tracking-wide hover:bg-transparent"
              aria-expanded={showFlown}
              onClick={() => setShowFlown((value) => !value)}
              id="flown-title"
            >
              Odbyte · {flown.length} {showFlown ? "▴" : "▾"}
            </Button>
            {showFlown
              ? flown.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    today={today}
                    wizzCheckedAt={null}
                    refreshing={false}
                    pendingDelete={pendingDelete === booking.id}
                    onRefresh={() => undefined}
                    onAccept={() => undefined}
                    onEdit={() => setDialog({ key: Date.now(), booking })}
                    onDelete={() => (pendingDelete === booking.id ? remove(booking.id) : setPendingDelete(booking.id))}
                    onCancelDelete={() => setPendingDelete(null)}
                  />
                ))
              : null}
          </section>
        ) : null}
      </main>

      {dialog ? (
        <BookingDialog
          key={dialog.key}
          open
          booking={dialog.booking}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSave={(draft) => save(draft, dialog.booking)}
        />
      ) : null}
    </div>
  );
}

function BookingCard({
  booking,
  today,
  wizzCheckedAt,
  refreshing,
  pendingDelete,
  onRefresh,
  onAccept,
  onEdit,
  onDelete,
  onCancelDelete,
}: {
  booking: Booking;
  today: string;
  wizzCheckedAt: string | null;
  refreshing: boolean;
  pendingDelete: boolean;
  onRefresh: () => void;
  onAccept: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const destination = lookupDestination(booking.destinationIata);
  const flown = bookingFlown(booking, today);
  const check = booking.lastCheck;
  const changed = check?.outbound?.status === "changed" || check?.return?.status === "changed";
  const nextDate = nextBookingLeg(booking, today).date;
  const bothLegs = booking.outbound != null && booking.return != null;

  return (
    <Card className={cn("gap-0 pt-0 pb-0", changed && "ring-amber-500/50")}>
      <div aria-hidden className={cn("h-1.5 w-full", flown ? "bg-border" : booking.airline === "ryanair" ? "bg-ryanair-yellow" : "bg-wizz")} />
      <CardHeader className={cn("pt-4 pb-3", flown && "opacity-60")}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="font-heading text-xs font-semibold tracking-[0.16em] text-brand-ink uppercase">
              {bothLegs ? `KRK ⇄ ${booking.destinationIata}` : booking.outbound ? `KRK → ${booking.destinationIata}` : `${booking.destinationIata} → KRK`}
            </p>
            <h3 className="font-heading text-2xl leading-tight font-semibold tracking-wide">
              {destination?.city ?? booking.destinationIata}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
              <AirlineChip airline={booking.airline} />
              {booking.reference ? (
                <span>
                  Kod <span className="font-mono font-semibold text-foreground">{booking.reference}</span>
                </span>
              ) : null}
              {booking.passengers > 1 ? <span>· {passengersLabel(booking.passengers)}</span> : null}
              {booking.paid != null ? <span>· {formatPln(booking.paid)}</span> : null}
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold",
              flown ? "bg-muted text-muted-foreground" : "bg-ryanair-yellow/20 text-brand-ink dark:text-ryanair-yellow",
            )}
          >
            {flown ? "Odbyty" : daysUntilLabel(nextDate, today)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 pb-4">
        <div className={cn("grid overflow-hidden rounded-xl border", bothLegs && "sm:grid-cols-2", flown && "opacity-60")}>
          {booking.outbound ? (
            <LegView
              icon={<PlaneTakeoff />}
              title={`Wylot · KRK → ${booking.destinationIata}`}
              leg={booking.outbound}
              check={check?.outbound ?? null}
              past={booking.outbound.date < today}
            />
          ) : null}
          {booking.return ? (
            <LegView
              icon={<PlaneLanding />}
              title={`Powrót · ${booking.destinationIata} → KRK`}
              leg={booking.return}
              check={check?.return ?? null}
              past={booking.return.date < today}
              className={cn(bothLegs && "border-t sm:border-t-0 sm:border-l")}
            />
          ) : null}
        </div>
        {changed && !flown ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <span>Linia zmieniła rozkład. Sprawdź e-mail od {AIRLINE_LABEL[booking.airline]}.</span>
            <Button type="button" size="sm" variant="outline" onClick={onAccept}>
              Zapisz nowe godziny
            </Button>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t py-3">
        <span className="text-xs text-muted-foreground">
          {flown
            ? "Lot się odbył."
            : check
              ? `Sprawdzono ${formatCheckedAt(check.checkedAt)}${booking.airline === "wizzair" && wizzCheckedAt ? ` · rozkład Wizz z ${formatCheckedAt(wizzCheckedAt)}` : ""}`
              : "Jeszcze nie sprawdzono rozkładu."}
        </span>
        <div className="flex flex-wrap gap-1">
          {!flown ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} /> {refreshing ? "Sprawdzam…" : "Odśwież"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <Pencil /> Edytuj
          </Button>
          {pendingDelete ? (
            <>
              <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
                Usuń na pewno
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete}>
                Anuluj
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 /> Usuń
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function LegView({
  icon,
  title,
  leg,
  check,
  past,
  className,
}: {
  icon: ReactNode;
  title: string;
  leg: BookingLeg;
  check: LegCheck | null;
  past: boolean;
  className?: string;
}) {
  const clock = flightClock(leg.depart, leg.arrive);
  return (
    <div className={cn("grid content-start gap-1 px-3 py-2.5", className)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {title}
      </p>
      <p className="font-medium first-letter:uppercase">{formatFlightDay(leg.date)}</p>
      <p className="text-lg font-semibold tabular-nums">
        {clock ?? "—"}
        {leg.flightNumber ? <span className="text-sm font-normal text-muted-foreground"> · {leg.flightNumber}</span> : null}
      </p>
      {past ? null : <LegStatus leg={leg} check={check} />}
    </div>
  );
}

function LegStatus({ leg, check }: { leg: BookingLeg; check: LegCheck | null }) {
  if (!check) return null;
  const base = "mt-1 flex items-start gap-1.5 rounded-md px-2 py-1 text-sm [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0";
  switch (check.status) {
    case "ok":
      return (
        <p className={cn(base, "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")}>
          <CheckCircle2 /> Zgodnie z rozkładem{!leg.depart ? ` · ${describe(check.flight)}` : ""}
        </p>
      );
    case "changed":
      return (
        <p className={cn(base, "bg-amber-500/10 text-amber-900 dark:text-amber-200")}>
          <Clock />
          <span>
            Zmiana: teraz <span className="font-semibold tabular-nums">{describe(check.flight)}</span>
            {leg.depart ? <span className="text-muted-foreground"> (było {flightClock(leg.depart, leg.arrive)})</span> : null}
          </span>
        </p>
      );
    case "missing":
      return (
        <p className={cn(base, "bg-destructive/10 text-destructive")}>
          <AlertTriangle />
          <span>
            Tego lotu nie ma w rozkładzie. Lot mógł zostać odwołany albo przeniesiony.
            {check.others.length > 0 ? ` Tego dnia: ${check.others.map(describe).join(", ")}.` : " Tego dnia linia nie ma lotów na tej trasie."}
          </span>
        </p>
      );
    case "unpublished":
      return <p className={cn(base, "bg-muted/60 text-muted-foreground")}>Rozkład na ten dzień nie jest jeszcze opublikowany.</p>;
    case "failed":
      return <p className={cn(base, "bg-muted/60 text-muted-foreground")}>Rozkład nie odpowiedział. Spróbuj odświeżyć później.</p>;
  }
}

function describe(flight: ScheduledFlight): string {
  const clock = flightClock(flight.depart, flight.arrive) ?? flight.depart;
  return flight.number ? `${clock} ${flight.number}` : clock;
}

const checkedFormatter = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function formatCheckedAt(iso: string): string {
  return checkedFormatter.format(new Date(iso));
}

function passengersLabel(count: number): string {
  const lastDigit = count % 10;
  const teen = count % 100 >= 12 && count % 100 <= 14;
  return `${count} ${lastDigit >= 2 && lastDigit <= 4 && !teen ? "osoby" : "osób"}`;
}

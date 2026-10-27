import type { SearchTrip } from "./types";

const RYANAIR_ORIGIN = "https://www.ryanair.com/pl/pl/trip/flights/select";
const WIZZ_ORIGIN = "https://www.wizzair.com/pl-pl/booking/select-flight";

/** Public Ryanair booking page with airports and dates in the query string. */
export function ryanairSearchUrl(trip: SearchTrip, destinationIata: string): string {
  const params = new URLSearchParams({
    adults: "1",
    teens: "0",
    children: "0",
    infants: "0",
    dateOut: trip.outboundFrom,
    dateIn: trip.returnDate ?? "",
    isConnectedFlight: "false",
    discount: "0",
    promoCode: "",
    isReturn: trip.returnDate ? "true" : "false",
    originIata: "KRK",
    destinationIata,
    tpAdults: "1",
    tpTeens: "0",
    tpChildren: "0",
    tpInfants: "0",
    tpStartDate: trip.outboundFrom,
    tpEndDate: trip.outboundTo ?? trip.returnDate ?? "",
    tpDiscount: "0",
    tpPromoCode: "",
    tpOriginIata: "KRK",
    tpDestinationIata: destinationIata,
  });

  return `${RYANAIR_ORIGIN}?${params.toString()}`;
}

/**
 * Public Wizz Air booking page. The path takes one outbound date,
 * so a date range opens on its first day.
 */
export function wizzairSearchUrl(trip: SearchTrip, destinationIata: string): string {
  const inbound = trip.returnDate ?? "null";
  return `${WIZZ_ORIGIN}/KRK/${destinationIata}/${trip.outboundFrom}/${inbound}/1/0/0/null`;
}

export function wizzRangeNote(trip: SearchTrip): string | null {
  if (!trip.outboundTo || trip.outboundTo === trip.outboundFrom) return null;
  return "Wizz Air otwiera pierwszy dzień zakresu. Dalsze daty wybierzesz w kalendarzu na ich stronie.";
}

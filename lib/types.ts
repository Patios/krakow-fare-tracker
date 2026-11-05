export type Airline = "ryanair" | "wizzair";

export type Destination = {
  iata: string;
  city: string;
  airport: string;
  country: string;
  airlines: Airline[];
};

export type WatchedRoute = {
  id: string;
  destinationIata: string;
  outboundFrom: string;
  outboundTo: string | null;
  returnDate: string | null;
  createdAt: string;
  outboundDepart?: string | null;
  outboundArrive?: string | null;
  returnDepart?: string | null;
  returnArrive?: string | null;
  /** Ryanair price is fetched on a timer while the page is open. */
  autoRefresh?: boolean;
  /** Manual position. Missing means the route still follows the automatic price order. */
  sortIndex?: number;
};

export type FlightTimes = {
  outboundDepart: string | null;
  outboundArrive: string | null;
  returnDepart: string | null;
  returnArrive: string | null;
};

export type PriceDraft = FlightTimes & {
  airline: Airline;
  /** Trip total. For a round trip entered as two fares, this is their sum. */
  amount: number;
  checkedOn: string;
  /** Set together when the fare was entered as an outbound price and a return price. */
  outboundAmount?: number | null;
  returnAmount?: number | null;
};

export type PriceLog = PriceDraft & {
  id: string;
  routeId: string;
  currency: "PLN";
  createdAt: string;
  /** Set only on prices read from Ryanair: "FR3799 2026-11-23", legs joined with "; ". */
  autoFlights?: string | null;
};

export type StoreData = {
  routes: WatchedRoute[];
  logs: PriceLog[];
};

export type SearchTrip = {
  outboundFrom: string;
  outboundTo: string | null;
  returnDate: string | null;
};

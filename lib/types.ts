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
};

export type FlightTimes = {
  outboundDepart: string | null;
  outboundArrive: string | null;
  returnDepart: string | null;
  returnArrive: string | null;
};

export type PriceDraft = FlightTimes & {
  airline: Airline;
  amount: number;
  checkedOn: string;
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

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

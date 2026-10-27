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
};

export type PriceLog = {
  id: string;
  routeId: string;
  airline: Airline;
  amount: number;
  currency: "PLN";
  checkedOn: string;
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

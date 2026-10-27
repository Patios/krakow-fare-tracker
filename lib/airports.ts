import type { Airline, Destination } from "./types";

/**
 * Regular KRK connections for winter 2026/27.
 * Source: Kraków Airport route guide dated 20 October 2026.
 * Ryanair and Wizz Air only. No other airports.
 */
export const RYANAIR_IATA = [
  "ABZ",
  "AGA",
  "ALC",
  "BCN",
  "BRI",
  "BFS",
  "BHX",
  "BLQ",
  "BOH",
  "BRS",
  "CRL",
  "BUD",
  "BBU",
  "CAG",
  "DUB",
  "DBV",
  "EMA",
  "EDI",
  "EIN",
  "FAO",
  "FUE",
  "GDN",
  "GLA",
  "GOT",
  "LPA",
  "CTA",
  "CPH",
  "SUF",
  "LBA",
  "LIS",
  "LPL",
  "LTN",
  "STN",
  "MAD",
  "AGP",
  "MLA",
  "MAN",
  "RAK",
  "MRS",
  "BGY",
  "MXP",
  "FMM",
  "NAP",
  "NCL",
  "TRF",
  "PFO",
  "PMO",
  "BVA",
  "PSR",
  "PSA",
  "OPO",
  "PRG",
  "RBA",
  "RIX",
  "CIA",
  "SKG",
  "SVQ",
  "SNN",
  "SOF",
  "ARN",
  "TFS",
  "TIA",
  "TRS",
  "TLS",
  "VLC",
  "VCE",
  "VIE",
] as const;

export const WIZZ_IATA = [
  "BCN",
  "BSL",
  "BGO",
  "BIO",
  "BUD",
  "BBU",
  "EIN",
  "LCA",
  "LGW",
  "LYS",
  "AGP",
  "RMF",
  "MXP",
  "NCE",
  "OSL",
  "FCO",
  "SVG",
  "TLL",
  "TLV",
  "VLC",
  "VCE",
  "VRN",
  "VNO",
] as const;

type Iata = (typeof RYANAIR_IATA)[number] | (typeof WIZZ_IATA)[number];

type AirportMeta = {
  city: string;
  airport: string;
  country: string;
};

const AIRPORTS: Record<Iata, AirportMeta> = {
  ABZ: { city: "Aberdeen", airport: "Dyce", country: "Wielka Brytania" },
  AGA: { city: "Agadir", airport: "Al Massira", country: "Maroko" },
  AGP: { city: "Malaga", airport: "Costa del Sol", country: "Hiszpania" },
  ALC: { city: "Alicante", airport: "Elche", country: "Hiszpania" },
  ARN: { city: "Sztokholm", airport: "Arlanda", country: "Szwecja" },
  BBU: { city: "Bukareszt Băneasa", airport: "Aurel Vlaicu", country: "Rumunia" },
  BCN: { city: "Barcelona", airport: "El Prat", country: "Hiszpania" },
  BFS: { city: "Belfast", airport: "Aldergrove", country: "Wielka Brytania" },
  BGO: { city: "Bergen", airport: "Flesland", country: "Norwegia" },
  BGY: { city: "Mediolan Bergamo", airport: "Orio al Serio", country: "Włochy" },
  BHX: { city: "Birmingham", airport: "Birmingham", country: "Wielka Brytania" },
  BIO: { city: "Bilbao", airport: "Bilbao", country: "Hiszpania" },
  BLQ: { city: "Bolonia", airport: "Guglielmo Marconi", country: "Włochy" },
  BOH: { city: "Bournemouth", airport: "Bournemouth", country: "Wielka Brytania" },
  BRI: { city: "Bari", airport: "Karol Wojtyła", country: "Włochy" },
  BRS: { city: "Bristol", airport: "Bristol", country: "Wielka Brytania" },
  BSL: { city: "Bazylea", airport: "EuroAirport", country: "Szwajcaria" },
  BUD: { city: "Budapeszt", airport: "Ferenc Liszt", country: "Węgry" },
  BVA: { city: "Paryż Beauvais", airport: "Beauvais-Tillé", country: "Francja" },
  CAG: { city: "Cagliari", airport: "Elmas", country: "Włochy" },
  CIA: { city: "Rzym Ciampino", airport: "Ciampino", country: "Włochy" },
  CPH: { city: "Kopenhaga", airport: "Kastrup", country: "Dania" },
  CRL: { city: "Bruksela Charleroi", airport: "Brussels South", country: "Belgia" },
  CTA: { city: "Katania", airport: "Fontanarossa", country: "Włochy" },
  DBV: { city: "Dubrownik", airport: "Dubrownik", country: "Chorwacja" },
  DUB: { city: "Dublin", airport: "Dublin", country: "Irlandia" },
  EDI: { city: "Edynburg", airport: "Edynburg", country: "Wielka Brytania" },
  EIN: { city: "Eindhoven", airport: "Eindhoven", country: "Holandia" },
  EMA: { city: "East Midlands", airport: "East Midlands", country: "Wielka Brytania" },
  FAO: { city: "Faro", airport: "Faro", country: "Portugalia" },
  FCO: { city: "Rzym Fiumicino", airport: "Fiumicino", country: "Włochy" },
  FMM: { city: "Memmingen", airport: "Allgäu", country: "Niemcy" },
  FUE: { city: "Fuerteventura", airport: "Fuerteventura", country: "Hiszpania" },
  GDN: { city: "Gdańsk", airport: "Lech Wałęsa", country: "Polska" },
  GLA: { city: "Glasgow", airport: "Glasgow", country: "Wielka Brytania" },
  GOT: { city: "Göteborg", airport: "Landvetter", country: "Szwecja" },
  LBA: { city: "Leeds Bradford", airport: "Leeds Bradford", country: "Wielka Brytania" },
  LCA: { city: "Larnaka", airport: "Larnaka", country: "Cypr" },
  LGW: { city: "Londyn Gatwick", airport: "Gatwick", country: "Wielka Brytania" },
  LIS: { city: "Lizbona", airport: "Humberto Delgado", country: "Portugalia" },
  LPA: { city: "Gran Canaria", airport: "Las Palmas", country: "Hiszpania" },
  LPL: { city: "Liverpool", airport: "John Lennon", country: "Wielka Brytania" },
  LTN: { city: "Londyn Luton", airport: "Luton", country: "Wielka Brytania" },
  LYS: { city: "Lyon", airport: "Saint-Exupéry", country: "Francja" },
  MAD: { city: "Madryt", airport: "Barajas", country: "Hiszpania" },
  MAN: { city: "Manchester", airport: "Manchester", country: "Wielka Brytania" },
  MLA: { city: "Malta", airport: "Malta", country: "Malta" },
  MRS: { city: "Marsylia", airport: "Provence", country: "Francja" },
  MXP: { city: "Mediolan Malpensa", airport: "Malpensa", country: "Włochy" },
  NAP: { city: "Neapol", airport: "Kapodichino", country: "Włochy" },
  NCE: { city: "Nicea", airport: "Côte d'Azur", country: "Francja" },
  NCL: { city: "Newcastle", airport: "Newcastle", country: "Wielka Brytania" },
  OPO: { city: "Porto", airport: "Francisco Sá Carneiro", country: "Portugalia" },
  OSL: { city: "Oslo Gardermoen", airport: "Gardermoen", country: "Norwegia" },
  PFO: { city: "Pafos", airport: "Pafos", country: "Cypr" },
  PMO: { city: "Palermo", airport: "Falcone–Borsellino", country: "Włochy" },
  PRG: { city: "Praga", airport: "Václav Havel", country: "Czechy" },
  PSA: { city: "Piza", airport: "Galileo Galilei", country: "Włochy" },
  PSR: { city: "Pescara", airport: "Abruzzo", country: "Włochy" },
  RAK: { city: "Marrakesz", airport: "Menara", country: "Maroko" },
  RBA: { city: "Rabat", airport: "Rabat–Salé", country: "Maroko" },
  RIX: { city: "Ryga", airport: "Ryga", country: "Łotwa" },
  RMF: { city: "Marsa Alam", airport: "Marsa Alam", country: "Egipt" },
  SKG: { city: "Saloniki", airport: "Macedonia", country: "Grecja" },
  SNN: { city: "Shannon", airport: "Shannon", country: "Irlandia" },
  SOF: { city: "Sofia", airport: "Sofia", country: "Bułgaria" },
  SVQ: { city: "Sewilla", airport: "Sewilla", country: "Hiszpania" },
  STN: { city: "Londyn Stansted", airport: "Stansted", country: "Wielka Brytania" },
  SUF: { city: "Lamezia Terme", airport: "Lamezia Terme", country: "Włochy" },
  SVG: { city: "Stavanger", airport: "Sola", country: "Norwegia" },
  TFS: { city: "Teneryfa", airport: "Teneryfa Południe", country: "Hiszpania" },
  TIA: { city: "Tirana", airport: "Tirana", country: "Albania" },
  TLL: { city: "Tallinn", airport: "Lennart Meri", country: "Estonia" },
  TLS: { city: "Tuluza", airport: "Blagnac", country: "Francja" },
  TLV: { city: "Tel Awiw", airport: "Ben Guriona", country: "Izrael" },
  TRF: { city: "Oslo Torp", airport: "Sandefjord Torp", country: "Norwegia" },
  TRS: { city: "Triest", airport: "Triest", country: "Włochy" },
  VCE: { city: "Wenecja", airport: "Marco Polo", country: "Włochy" },
  VIE: { city: "Wiedeń", airport: "Schwechat", country: "Austria" },
  VLC: { city: "Walencja", airport: "Walencja", country: "Hiszpania" },
  VNO: { city: "Wilno", airport: "Wilno", country: "Litwa" },
  VRN: { city: "Werona", airport: "Villafranca", country: "Włochy" },
};

const ryanair = new Set<string>(RYANAIR_IATA);
const wizzair = new Set<string>(WIZZ_IATA);

export function airlinesFor(iata: string): Airline[] {
  const airlines: Airline[] = [];
  if (ryanair.has(iata)) airlines.push("ryanair");
  if (wizzair.has(iata)) airlines.push("wizzair");
  return airlines;
}

export const AIRLINE_LABEL: Record<Airline, string> = {
  ryanair: "Ryanair",
  wizzair: "Wizz Air",
};

export const AIRLINE_HOME_URL: Record<Airline, string> = {
  ryanair: "https://www.ryanair.com/pl/pl",
  wizzair: "https://www.wizzair.com/pl-pl",
};

function toDestination(iata: Iata): Destination {
  return {
    iata,
    ...AIRPORTS[iata],
    airlines: airlinesFor(iata),
  };
}

const uniqueIata = [...new Set<Iata>([...RYANAIR_IATA, ...WIZZ_IATA])];

export const destinations: Destination[] = uniqueIata
  .map(toDestination)
  .sort((a, b) => a.city.localeCompare(b.city, "pl") || a.iata.localeCompare(b.iata));

export const destinationByIata = new Map(
  destinations.map((destination) => [destination.iata, destination]),
);

export const ROUTE_LIST_AS_OF = "2026-10-20";

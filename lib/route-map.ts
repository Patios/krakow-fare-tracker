import { airlinesFor, destinationByIata, destinations } from "./airports";
import type { Airline } from "./types";

type Coordinates = { lat: number; lon: number };

// Airport coordinates, used only to place the schematic route map.
const coordinates: Record<string, Coordinates> = {
  ABZ: { lat: 57.2, lon: -2.2 }, AGA: { lat: 30.3, lon: -9.4 }, AGP: { lat: 36.7, lon: -4.5 },
  ALC: { lat: 38.3, lon: -0.6 }, ARN: { lat: 59.6, lon: 17.9 }, BBU: { lat: 44.5, lon: 26.1 },
  BCN: { lat: 41.3, lon: 2.1 }, BFS: { lat: 54.7, lon: -6.2 }, BGO: { lat: 60.3, lon: 5.2 },
  BGY: { lat: 45.7, lon: 9.7 }, BHX: { lat: 52.5, lon: -1.7 }, BIO: { lat: 43.3, lon: -2.9 },
  BLQ: { lat: 44.5, lon: 11.3 }, BOH: { lat: 50.8, lon: -1.8 }, BRI: { lat: 41.1, lon: 16.8 },
  BRS: { lat: 51.4, lon: -2.7 }, BSL: { lat: 47.6, lon: 7.5 }, BUD: { lat: 47.4, lon: 19.3 },
  BVA: { lat: 49.5, lon: 2.1 }, CAG: { lat: 39.3, lon: 9.1 }, CIA: { lat: 41.8, lon: 12.6 },
  CPH: { lat: 55.6, lon: 12.7 }, CRL: { lat: 50.5, lon: 4.5 }, CTA: { lat: 37.5, lon: 15.1 },
  DBV: { lat: 42.6, lon: 18.3 }, DUB: { lat: 53.4, lon: -6.3 }, EDI: { lat: 55.9, lon: -3.4 },
  EIN: { lat: 51.5, lon: 5.4 }, EMA: { lat: 52.8, lon: -1.3 }, FAO: { lat: 37.0, lon: -7.9 },
  FCO: { lat: 41.8, lon: 12.2 }, FMM: { lat: 47.9, lon: 10.2 }, FUE: { lat: 28.5, lon: -13.9 },
  GDN: { lat: 54.4, lon: 18.5 }, GLA: { lat: 55.9, lon: -4.4 }, GOT: { lat: 57.7, lon: 12.3 },
  LBA: { lat: 53.9, lon: -1.7 }, LCA: { lat: 34.9, lon: 33.6 }, LGW: { lat: 51.2, lon: -0.2 },
  LIS: { lat: 38.8, lon: -9.1 }, LPA: { lat: 28.0, lon: -15.4 }, LPL: { lat: 53.3, lon: -2.8 },
  LTN: { lat: 51.9, lon: -0.4 }, LYS: { lat: 45.7, lon: 5.1 }, MAD: { lat: 40.5, lon: -3.6 },
  MAN: { lat: 53.4, lon: -2.3 }, MLA: { lat: 35.9, lon: 14.5 }, MRS: { lat: 43.4, lon: 5.2 },
  MXP: { lat: 45.6, lon: 8.7 }, NAP: { lat: 40.9, lon: 14.3 }, NCE: { lat: 43.7, lon: 7.2 },
  NCL: { lat: 55.0, lon: -1.7 }, OPO: { lat: 41.2, lon: -8.7 }, OSL: { lat: 60.2, lon: 11.1 },
  PFO: { lat: 34.7, lon: 32.5 }, PMO: { lat: 38.2, lon: 13.1 }, PRG: { lat: 50.1, lon: 14.3 },
  PSA: { lat: 43.7, lon: 10.4 }, PSR: { lat: 42.4, lon: 14.2 }, RAK: { lat: 31.6, lon: -8.0 },
  RBA: { lat: 34.0, lon: -6.8 }, RIX: { lat: 56.9, lon: 24.1 }, RMF: { lat: 25.6, lon: 34.6 },
  SKG: { lat: 40.5, lon: 22.9 }, SNN: { lat: 52.7, lon: -8.9 }, SOF: { lat: 42.7, lon: 23.4 },
  SVQ: { lat: 37.4, lon: -5.9 }, STN: { lat: 51.9, lon: 0.2 }, SUF: { lat: 38.9, lon: 16.2 },
  SVG: { lat: 58.9, lon: 5.6 }, TFS: { lat: 28.0, lon: -16.6 }, TIA: { lat: 41.4, lon: 19.7 },
  TLL: { lat: 59.4, lon: 24.8 }, TLS: { lat: 43.6, lon: 1.4 }, TLV: { lat: 32.0, lon: 34.9 },
  TRF: { lat: 59.2, lon: 10.3 }, TRS: { lat: 45.8, lon: 13.5 }, VCE: { lat: 45.5, lon: 12.4 },
  VIE: { lat: 48.1, lon: 16.6 }, VLC: { lat: 39.5, lon: -0.5 }, VNO: { lat: 54.6, lon: 25.3 },
  VRN: { lat: 45.4, lon: 10.9 },
};

const bounds = { west: -18, east: 37, north: 63, south: 24 };

/** Airports Ryanair sells from KRK that are not in the 20 Oct 2026 winter guide. */
export const EXTRA_COORDINATES: Record<string, Coordinates> = {
  AOI: { lat: 43.62, lon: 13.36 },
  ATH: { lat: 37.94, lon: 23.94 },
  CDT: { lat: 40.21, lon: 0.07 },
  CFU: { lat: 39.6, lon: 19.91 },
  CHQ: { lat: 35.53, lon: 24.15 },
  GRO: { lat: 41.9, lon: 2.76 },
  LDE: { lat: 43.19, lon: -0.0 },
  OLB: { lat: 40.9, lon: 9.52 },
  PMI: { lat: 39.55, lon: 2.74 },
  RHO: { lat: 36.41, lon: 28.09 },
  RMI: { lat: 44.02, lon: 12.61 },
  SZZ: { lat: 53.58, lon: 14.9 },
  TGD: { lat: 42.36, lon: 19.25 },
  TNG: { lat: 35.73, lon: -5.92 },
  TRN: { lat: 45.2, lon: 7.65 },
  ZAD: { lat: 44.11, lon: 15.35 },
};

export function projectAirport(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon - bounds.west) / (bounds.east - bounds.west)) * 100,
    y: ((bounds.north - lat) / (bounds.north - bounds.south)) * 100,
  };
}

export type MappedRoute = {
  iata: string;
  city: string;
  country: string;
  airlines: Airline[];
  x: number;
  y: number;
};

// Kraków Airport: 50.0777°N, 19.7848°E, projected using the bounds above.
export const krakowPoint = { x: 68.7, y: 33.1 };

export const mappedRoutes: MappedRoute[] = destinations.map((destination) => {
  const position = coordinates[destination.iata];
  if (!position) throw new Error(`Missing map coordinates for ${destination.iata}`);
  return {
    iata: destination.iata,
    city: destination.city,
    country: destination.country,
    airlines: airlinesFor(destination.iata),
    x: ((position.lon - bounds.west) / (bounds.east - bounds.west)) * 100,
    y: ((bounds.north - position.lat) / (bounds.north - bounds.south)) * 100,
  };
});

export function withLiveRyanair(live: { iata: string; city: string; country: string }[]): {
  routes: MappedRoute[];
  unplaced: { iata: string; city: string; country: string }[];
} {
  const known = new Set(mappedRoutes.map((route) => route.iata));
  const added: MappedRoute[] = [];
  const unplaced: { iata: string; city: string; country: string }[] = [];
  for (const airport of live) {
    if (known.has(airport.iata)) continue;
    const position = EXTRA_COORDINATES[airport.iata];
    if (!position) {
      unplaced.push(airport);
      continue;
    }
    added.push({ ...airport, airlines: ["ryanair"], ...projectAirport(position.lat, position.lon) });
  }
  added.sort((a, b) => a.city.localeCompare(b.city, "pl"));
  return { routes: [...mappedRoutes, ...added], unplaced };
}

export const airlineRouteCount: Record<Airline, number> = {
  ryanair: mappedRoutes.filter((route) => route.airlines.includes("ryanair")).length,
  wizzair: mappedRoutes.filter((route) => route.airlines.includes("wizzair")).length,
};

export const mapDestinationByIata = destinationByIata;

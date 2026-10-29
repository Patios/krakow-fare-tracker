import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tanie loty z Krakowa",
    short_name: "Tanie loty",
    description: "Obserwuj trasy Ryanair i Wizz Air z lotniska KRK.",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#073590",
    theme_color: "#073590",
    lang: "pl",
    icons: [
      { src: `${base}/icon-180.png`, sizes: "180x180", type: "image/png" },
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}

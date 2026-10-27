import type { Metadata } from "next";
import { ConnectionMap } from "@/components/connection-map";

export const metadata: Metadata = {
  title: "Mapa połączeń z Krakowa",
  description: "Mapa regularnych połączeń Ryanair i Wizz Air z lotniska Kraków Airport.",
};

export default function ConnectionMapPage() {
  return <ConnectionMap />;
}

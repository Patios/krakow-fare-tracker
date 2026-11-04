import type { Metadata } from "next";
import { BestDealsBoard } from "@/components/best-deals-board";

export const metadata: Metadata = {
  title: "Najlepsze okazje · Tanie loty z Krakowa",
  description: "Najlepsze ceny Ryanair i Wizz Air z Krakowa w ciągu najbliższych 31 dni.",
};

export default function BestDealsPage() {
  return <BestDealsBoard />;
}

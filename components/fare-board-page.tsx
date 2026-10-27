"use client";

import { useSearchParams } from "next/navigation";
import { FareBoard } from "@/components/fare-board";

export function FareBoardPage() {
  const searchParams = useSearchParams();
  const initialDestinationIata = searchParams.get("destination")?.toUpperCase();

  return <FareBoard initialDestinationIata={initialDestinationIata} />;
}

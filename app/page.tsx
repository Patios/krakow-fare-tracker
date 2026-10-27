import { Suspense } from "react";
import { FareBoard } from "@/components/fare-board";
import { FareBoardPage } from "@/components/fare-board-page";

export default function Home() {
  return (
    <Suspense fallback={<FareBoard />}>
      <FareBoardPage />
    </Suspense>
  );
}

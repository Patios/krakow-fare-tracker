import { Plane } from "lucide-react";
import { AIRLINE_LABEL } from "@/lib/airports";
import type { Airline } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AirlineMark({
  airline,
  variant = "tile",
  className,
}: {
  airline: Airline;
  variant?: "tile" | "glyph";
  className?: string;
}) {
  const icon = <Plane aria-hidden strokeWidth={2.4} className={variant === "tile" ? "size-[58%]" : "size-full"} />;

  if (variant === "glyph") {
    return (
      <span className={cn("inline-flex size-4 shrink-0", className)} aria-hidden>
        {icon}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center",
        airline === "ryanair" ? "rounded-md bg-ryanair-yellow text-ryanair" : "rounded-full bg-wizz text-white",
        className,
      )}
      aria-hidden
    >
      {icon}
    </span>
  );
}

export function AirlineChip({ airline, className }: { airline: Airline; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-xs font-semibold",
        airline === "ryanair" ? "bg-secondary text-ryanair" : "bg-wizz-soft text-wizz",
        className,
      )}
    >
      <AirlineMark airline={airline} className="size-5" />
      {AIRLINE_LABEL[airline]}
    </span>
  );
}

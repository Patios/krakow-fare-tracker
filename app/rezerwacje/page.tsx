import type { Metadata } from "next";
import { BookingsBoard } from "@/components/bookings-board";

export const metadata: Metadata = {
  title: "Rezerwacje · Tanie loty z Krakowa",
  description: "Kupione loty Ryanair i Wizz Air z Krakowa ze zmianami w rozkładzie.",
};

export default function BookingsPage() {
  return <BookingsBoard />;
}

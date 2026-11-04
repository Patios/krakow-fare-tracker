import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Archiwum tras",
};

export default function ArchiveLayout({ children }: { children: ReactNode }) {
  return children;
}

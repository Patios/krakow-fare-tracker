import { useSyncExternalStore } from "react";

const STORAGE_KEY = "krk-fare-tracker.deals-sections.v1";

export type DealSection = "ryanair" | "wizzair" | "watched";

const SECTIONS: DealSection[] = ["ryanair", "wizzair", "watched"];

/** Missing or unreadable preferences stay expanded. */
export function parseDealSections(raw: string | null): Record<DealSection, boolean> {
  const expanded = { ryanair: true, wizzair: true, watched: true };
  if (!raw) return expanded;
  try {
    const value = JSON.parse(raw) as Partial<Record<DealSection, unknown>>;
    for (const section of SECTIONS) {
      if (value[section] === false) expanded[section] = false;
    }
  } catch {
    return { ryanair: true, wizzair: true, watched: true };
  }
  return expanded;
}

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeDealSections(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getDealSectionsSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getDealSectionsServerSnapshot(): string {
  return "";
}

export function writeDealSection(id: DealSection, expanded: boolean) {
  if (typeof localStorage === "undefined") return;
  const next = { ...parseDealSections(getDealSectionsSnapshot()), [id]: expanded };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  notify();
}

export function useDealSectionExpanded(id: DealSection): [boolean, () => void] {
  const raw = useSyncExternalStore(subscribeDealSections, getDealSectionsSnapshot, getDealSectionsServerSnapshot);
  const expanded = parseDealSections(raw)[id];
  const toggle = () => writeDealSection(id, !expanded);
  return [expanded, toggle];
}

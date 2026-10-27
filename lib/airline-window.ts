import type { Airline } from "./types";

/** Opens the airline search in a sized browser window. Returns false when the browser blocks it. */
export function openAirlineWindow(href: string, airline: Airline): boolean {
  const width = Math.min(1040, Math.max(480, Math.round(window.screen.availWidth * 0.58)));
  const height = Math.min(820, Math.max(480, Math.round(window.screen.availHeight * 0.86)));
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  const availLeft = screen.availLeft ?? 0;
  const availTop = screen.availTop ?? 0;
  const left = Math.max(0, availLeft + window.screen.availWidth - width - 16);
  const top = Math.max(0, availTop + 24);
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;

  try {
    const popup = window.open(href, `krk-fare-${airline}`, features);
    if (!popup) return false;
    try {
      popup.opener = null;
    } catch {
      // The window already left this origin.
    }
    try {
      popup.focus();
    } catch {
      // Focus can be refused after the window starts navigating.
    }
    return !popup.closed;
  } catch {
    return false;
  }
}

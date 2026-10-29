"use client";

import { useSyncExternalStore } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "krk-fare-tracker.install-hint.v1";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const listeners = new Set<() => void>();
let installPrompt: InstallPromptEvent | null = null;

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function installed() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function getSnapshot() {
  if (installed()) return "installed";
  try {
    if (localStorage.getItem(STORAGE_KEY) === "dismissed") return "dismissed";
  } catch {
    return "hidden";
  }
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent)) return "ios";
  if (/Android/i.test(agent)) return installPrompt ? "android-install" : "android-menu";
  return "hidden";
}

function dismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, "dismissed");
  } catch {
    // The hint stays hidden for this page view even when storage is blocked.
  }
  installPrompt = null;
  emit();
}

async function install() {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === "accepted") dismiss();
  else emit();
}

export function AddToHomeHint() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "server");
  if (mode === "server" || mode === "installed" || mode === "dismissed" || mode === "hidden") return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg">
      <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {mode === "ios" ? (
          <p>
            Na iPhonie stuknij <span className="font-semibold">Udostępnij</span>, potem{" "}
            <span className="font-semibold">Dodaj do ekranu początkowego</span>.
          </p>
        ) : mode === "android-install" ? (
          <p>Dodaj stronę na pulpit telefonu.</p>
        ) : (
          <p>
            W menu przeglądarki wybierz <span className="font-semibold">Dodaj do ekranu głównego</span>.
          </p>
        )}
        {mode === "android-install" ? (
          <Button type="button" className="mt-2 h-8" onClick={() => void install()}>
            Dodaj do pulpitu
          </Button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Zamknij podpowiedź"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

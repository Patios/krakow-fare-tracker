"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

function paintTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyTheme(theme: "light" | "dark") {
  paintTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The class still applies for this visit when storage is blocked.
  }
}

const headerControlClass =
  "border-white/35 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white dark:border-white/35! dark:bg-white/10! dark:text-white! dark:hover:bg-white/20! dark:hover:text-white!";

export function ThemeToggle({ className }: { className?: string }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        return;
      }
      paintTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-10",
        headerControlClass,
        className,
      )}
      onClick={() => applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}
      title="Przełącz motyw"
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:inline" />
      <span data-label className="dark:hidden">Ciemny</span>
      <span data-label className="hidden dark:inline">Jasny</span>    </Button>
  );
}

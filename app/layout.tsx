import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Outfit } from "next/font/google";
import Script from "next/script";
import { AddToHomeHint } from "@/components/add-to-home-hint";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
});

const barlow = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Tanie loty z Krakowa",
  description:
    "Obserwuj trasy Ryanair i Wizz Air z lotniska KRK. Aplikacja otwiera gotowe wyszukiwanie, a wpisane ceny zostają na koncie albo w tej przeglądarce.",
  appleWebApp: {
    title: "Tanie loty",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#073590",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      className={`${outfit.variable} ${barlow.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        {children}
        <AddToHomeHint />
      </body>
    </html>
  );
}

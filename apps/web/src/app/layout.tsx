import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";

import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NV Core — Business Operating System",
    template: "%s · NV Core",
  },
  description:
    "NV Core — plataforma multi-workspace de marketing, CRM y automatización omnicanal.",
};

export const viewport: Viewport = {
  themeColor: "#0B0D10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

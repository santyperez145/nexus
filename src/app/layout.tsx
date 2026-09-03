import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { APP_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Nexus — Independent AI model gateway",
    template: "%s · Nexus",
  },
  description:
    "Una API para cientos de modelos. Routing, fallbacks, créditos por token, BYOK y analytics.",
  applicationName: "Nexus",
  openGraph: {
    type: "website",
    siteName: "Nexus",
    title: "Nexus — Independent AI model gateway",
    description:
      "Una API para cientos de modelos. Routing, fallbacks, créditos por token, BYOK y analytics.",
    url: APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus — Independent AI model gateway",
    description: "Una API · cientos de modelos · 0% markup en inferencia",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

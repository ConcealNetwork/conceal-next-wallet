import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

const TITLE = "Conceal Wallet — Non-custodial CCX wallet";
const DESCRIPTION =
  "A fast, non-custodial in-browser wallet for Conceal (CCX). Your keys are generated and stored on your device — send, receive, deposit, and message privately.";
const SITE_URL = "https://concealnetwork.github.io/conceal-next-wallet";
const OG_IMAGE = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: {
    default: TITLE,
    template: "%s · Conceal Wallet",
  },
  description: DESCRIPTION,
  applicationName: "Conceal Wallet",
  keywords: ["Conceal", "CCX", "wallet", "cryptocurrency", "privacy", "CryptoNote", "web wallet"],
  authors: [{ name: "Conceal Community", url: "https://conceal.network" }],
  creator: "Conceal Community",
  publisher: "Conceal Community",
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    title: "Conceal Wallet",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "Conceal Wallet",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Conceal Wallet" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1613",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable, geistMono.variable)}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

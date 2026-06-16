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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a1613" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Resolve the saved theme before first paint so light users never see a dark
// flash (static export — no server runtime to set this). Mirrors lib/ui/theme.ts;
// kept inline/minified because it must run as a blocking script.
const THEME_INIT_SCRIPT = `(function(){var p="system";try{var s=localStorage.getItem("ccx-theme");if(s==="light"||s==="dark"||s==="system")p=s;}catch(_){}try{var d=p==="dark"||(p==="system"&&typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.classList.toggle("dark",d);e.classList.toggle("light",!d);}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The no-FOUC theme script mutates <html> (data-theme + light/dark class)
      // before hydration, so its attributes intentionally differ from SSR.
      suppressHydrationWarning
      // No hardcoded theme class — the palette is driven by the data-theme
      // attribute (set by the no-FOUC script + ThemeProvider). Default (no
      // attribute) is the dark :root tokens.
      className={cn("font-sans", geist.variable, geistMono.variable)}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-authored no-FOUC theme script */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

"use client";

import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WalletServiceWorkerRegister } from "@/components/wallet/wallet-service-worker";
import { WalletQueryProvider } from "@/lib/hooks/query-provider";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { WalletSessionProvider } from "@/lib/session/wallet-session";
import { ThemeProvider } from "@/lib/ui/theme-provider";
import { TickerPreferenceProvider } from "@/lib/ui/ticker-preference-provider";

// Sonner CSS variables — warm Aurora palette. `richColors` must stay on so Sonner
// applies type-specific styles; these vars override its default saturated colors.
const TOAST_STYLE: CSSProperties = {
  // normal
  "--normal-bg": "hsl(36 9% 13%)",
  "--normal-border": "hsl(34 9% 21%)",
  "--normal-text": "hsl(0 0% 100%)",
  // success — wallet-incoming family, brighter for dark UI contrast
  "--success-bg": "hsl(160 42% 14%)",
  "--success-border": "#34d399",
  "--success-text": "hsl(0 0% 100%)",
  // error — wallet-outgoing (#ef4444)
  "--error-bg": "hsl(0 42% 14%)",
  "--error-border": "#f87171",
  "--error-text": "hsl(0 0% 100%)",
  // warning — wallet-amber (#f5a623)
  "--warning-bg": "hsl(38 42% 14%)",
  "--warning-border": "#fbbf24",
  "--warning-text": "hsl(0 0% 100%)",
} as CSSProperties;

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <WalletQueryProvider>
          <WalletSessionProvider>
            <TickerPreferenceProvider>
              <WalletServiceWorkerRegister />
              <TooltipProvider>
                {children}
                {/* Standardized notifications: richColors + the wallet-palette
                    TOAST_STYLE theme every variant; `closeButton` makes them dismissible
                    (#120); 5s gives time to read while the close button allows early
                    dismissal. Per-call `duration` still overrides (e.g. sticky errors). */}
                <Toaster
                  richColors
                  closeButton
                  duration={5000}
                  position="top-right"
                  style={TOAST_STYLE}
                />
              </TooltipProvider>
            </TickerPreferenceProvider>
          </WalletSessionProvider>
        </WalletQueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

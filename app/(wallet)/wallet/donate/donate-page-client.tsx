"use client";

import { CreditCard, Heart, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common";
import {
  DONATION_CRYPTO_ADDRESSES,
  type DonationConfig,
  type DonationMethodKey,
} from "@/lib/donation-config";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

const PRESETS = [5, 15, 50, 100];

/** Stable frequency tokens; the display label is resolved via i18n at render. */
const FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABEL_KEYS: Record<Frequency, string> = {
  monthly: "donate.freqMonthly",
  quarterly: "donate.freqQuarterly",
  yearly: "donate.freqYearly",
};

const METHOD_LABEL_KEYS: Record<DonationMethodKey, string> = {
  crypto: "donate.methodCrypto",
  visa: "donate.methodVisa",
  paypal: "donate.methodPaypal",
  apple: "donate.methodApple",
};

const METHOD_DESCRIPTION_KEYS: Record<DonationMethodKey, string> = {
  crypto: "donate.descCrypto",
  visa: "donate.descVisa",
  paypal: "donate.descPaypal",
  apple: "donate.descApple",
};

export function DonatePageClient({ fiatEnabled, enabledMethods }: DonationConfig) {
  const { t } = useI18n();
  const visibleMethods = enabledMethods.map((key) => ({
    key,
    label: t(METHOD_LABEL_KEYS[key]),
  }));
  const defaultMethod: DonationMethodKey = visibleMethods[0]?.key ?? "crypto";
  const multipleMethods = visibleMethods.length > 1;
  const methodsDescription =
    enabledMethods.length === 1
      ? t(METHOD_DESCRIPTION_KEYS[enabledMethods[0]])
      : t("donate.descMultiple");

  const [preset, setPreset] = useState<number | null>(50);
  const [custom, setCustom] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [method, setMethod] = useState<DonationMethodKey>(defaultMethod);

  const amount = custom ? Number(custom) || 0 : (preset ?? 0);
  const cadence = recurring
    ? t("donate.recurringCadence", { frequency: t(FREQUENCY_LABEL_KEYS[frequency]) })
    : t("donate.oneTimeCadence");

  function donate() {
    if (amount <= 0) {
      toast.error(t("donate.errChooseAmount"));
      return;
    }
    toast.success(
      t("donate.mockToast", {
        // Use the localized cadence phrase as-is — lowercasing translated text
        // corrupts casing in other locales (German nouns, Turkish I/i, …).
        cadence,
        amount: `$${amount}`,
        method: t(METHOD_LABEL_KEYS[method]),
      }),
    );
  }

  return (
    <>
      <PageHeader title={t("donate.title")} subtitle={t("donate.subtitle")} />

      <div className="space-y-6">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <div className="wallet-card overflow-hidden bg-linear-to-br from-primary/10 to-transparent p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">{t("donate.whyTitle")}</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("donate.whyBody")}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Lock className="size-4 text-primary" aria-hidden="true" />{" "}
                {t("donate.securePayments")}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />{" "}
                {t("donate.privacyFirst")}
              </span>
              <span className="inline-flex items-center gap-2">
                <CreditCard className="size-4 text-primary" aria-hidden="true" />{" "}
                {t("donate.transparentFees")}
              </span>
            </div>
          </div>
        </div>

        {fiatEnabled ? (
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard
              title={t("donate.chooseTitle")}
              description={t("donate.chooseDescription")}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PRESETS.map((value) => {
                  const active = !custom && preset === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setPreset(value);
                        setCustom("");
                      }}
                      className={cn(
                        "h-16 cursor-pointer rounded-xl border text-lg font-semibold transition-[border-color,background-color,transform] duration-200 active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-secondary text-foreground hover:border-ring",
                      )}
                    >
                      ${value}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="custom">{t("donate.customLabel")}</Label>
                  <Input
                    id="custom"
                    type="number"
                    min="0"
                    step="1"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    placeholder={t("donate.customPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency">{t("donate.frequencyLabel")}</Label>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={recurring}
                      onCheckedChange={setRecurring}
                      aria-label={t("donate.recurringToggleAria")}
                    />
                    <span className="text-sm text-muted-foreground">{t("donate.recurring")}</span>
                    <select
                      id="frequency"
                      value={frequency}
                      onChange={(event) => setFrequency(event.target.value as Frequency)}
                      disabled={!recurring}
                      className="ml-auto h-10 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {FREQUENCIES.map((freq) => (
                        <option key={freq} value={freq}>
                          {t(FREQUENCY_LABEL_KEYS[freq])}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-5">
                <Button
                  type="button"
                  onClick={donate}
                  className="gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
                >
                  <Heart className="size-4" aria-hidden="true" />
                  {t("donate.donate")}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {cadence} — <span className="font-semibold text-foreground">${amount || 0}</span>
                </span>
              </div>
            </SectionCard>
          </div>
        ) : null}

        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
          <SectionCard title={t("donate.paymentMethods")} description={methodsDescription}>
            {multipleMethods ? (
              <div className="flex flex-wrap gap-2">
                {visibleMethods.map(({ key, label }) => {
                  const active = method === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMethod(key)}
                      aria-pressed={active}
                      className={cn(
                        "min-h-10 cursor-pointer rounded-xl border px-4 text-sm transition-[border-color,color,background-color] duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-ring hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {method === "crypto" ? (
              <div
                className={cn(
                  "grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start",
                  multipleMethods && "mt-5",
                )}
              >
                <div className="space-y-4">
                  {DONATION_CRYPTO_ADDRESSES.map((coin) => (
                    <div key={coin.name} className="rounded-xl bg-secondary p-4">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                        <p className="text-sm font-semibold">{coin.name}</p>
                      </div>
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                        {coin.address}
                      </p>
                      <div className="mt-3">
                        <CopyButton value={coin.address} label={t("donate.copyAddress")} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mx-auto rounded-2xl bg-white p-4">
                  <WalletQrCode value={DONATION_CRYPTO_ADDRESSES[0].address} size={170} />
                </div>
              </div>
            ) : (
              <p
                className={cn(
                  "rounded-xl bg-secondary p-4 text-sm text-muted-foreground",
                  multipleMethods && "mt-5",
                )}
              >
                {t("donate.mockMethodNote", { method: t(METHOD_LABEL_KEYS[method]) })}
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

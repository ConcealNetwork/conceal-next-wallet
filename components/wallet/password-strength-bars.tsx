"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";

export const PASSWORD_STRENGTH_LEVELS = [
  { labelKey: "password.strengthTooShort", className: "bg-wallet-outgoing" },
  { labelKey: "password.strengthWeak", className: "bg-wallet-outgoing" },
  { labelKey: "password.strengthFair", className: "bg-primary" },
  { labelKey: "password.strengthGood", className: "bg-primary" },
  { labelKey: "password.strengthStrong", className: "bg-wallet-incoming" },
  { labelKey: "password.strengthStrong", className: "bg-wallet-incoming" },
] as const;

export const WALLET_PASSWORD_HINTS = [
  {
    id: "length",
    labelKey: "password.req15",
    test: (password: string) => password.length > 15,
  },
  {
    id: "mixed",
    labelKey: "password.reqMixedCase",
    test: (password: string) => /[A-Z]/.test(password) && /[a-z]/.test(password),
  },
  {
    id: "letter",
    labelKey: "password.reqLetter",
    test: (password: string) => /[A-Za-z]/.test(password),
  },
  { id: "digit", labelKey: "password.reqDigit", test: (password: string) => /\d/.test(password) },
  {
    id: "symbol",
    labelKey: "password.reqSymbol",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

const STRENGTH_BAR_KEYS = [
  "strength-1",
  "strength-2",
  "strength-3",
  "strength-4",
  "strength-5",
] as const;

export function walletPasswordStrength(password: string) {
  return WALLET_PASSWORD_HINTS.filter((hint) => hint.test(password)).length;
}

/** Hard floor + variety minimum a wallet-encryption password must clear to submit. */
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_PASSWORD_STRENGTH = 3;

/**
 * Whether a password is strong enough to encrypt the wallet. Score alone is
 * insufficient (a 3-char "Ab1" scores 3), so we also require a length floor.
 */
export function walletPasswordIsAcceptable(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    walletPasswordStrength(password) >= MIN_PASSWORD_STRENGTH
  );
}

type PasswordStrengthBarsProps = {
  score: number;
  className?: string;
};

export function PasswordStrengthBars({ score, className }: PasswordStrengthBarsProps) {
  const { t } = useI18n();
  const level = PASSWORD_STRENGTH_LEVELS[Math.min(Math.max(score, 0), 5)];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-1" aria-hidden="true">
        {STRENGTH_BAR_KEYS.map((key, index) => (
          <span
            key={key}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              index < score ? level.className : "bg-secondary",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("password.strengthLabel", { value: t(level.labelKey) })}
      </p>
    </div>
  );
}

type WalletPasswordStrengthPanelProps = {
  password: string;
  showDisclaimer?: boolean;
};

export function WalletPasswordStrengthPanel({
  password,
  showDisclaimer = true,
}: WalletPasswordStrengthPanelProps) {
  const { t } = useI18n();
  if (password.length === 0) {
    return null;
  }

  const score = walletPasswordStrength(password);

  return (
    <div className="space-y-2">
      <PasswordStrengthBars score={score} />
      <ul className="space-y-1 text-xs text-muted-foreground">
        {WALLET_PASSWORD_HINTS.map((hint) => {
          const met = hint.test(password);
          return (
            <li
              key={hint.id}
              className={cn("flex items-center gap-2", met && "text-wallet-incoming")}
            >
              <span aria-hidden>{met ? "✓" : "○"}</span>
              {t(hint.labelKey)}
            </li>
          );
        })}
      </ul>
      {showDisclaimer && (
        <p className="text-xs text-muted-foreground">{walletCopy.passwordHintDisclaimer}</p>
      )}
    </div>
  );
}

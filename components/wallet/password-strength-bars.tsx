import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";

export const PASSWORD_STRENGTH_LEVELS = [
  { label: "Too short", className: "bg-wallet-outgoing" },
  { label: "Weak", className: "bg-wallet-outgoing" },
  { label: "Fair", className: "bg-primary" },
  { label: "Good", className: "bg-primary" },
  { label: "Strong", className: "bg-wallet-incoming" },
  { label: "Strong", className: "bg-wallet-incoming" },
] as const;

export const WALLET_PASSWORD_HINTS = [
  {
    id: "length",
    label: "More than 15 characters",
    test: (password: string) => password.length > 15,
  },
  {
    id: "mixed",
    label: "Upper and lower case letters",
    test: (password: string) => /[A-Z]/.test(password) && /[a-z]/.test(password),
  },
  {
    id: "letter",
    label: "At least one letter",
    test: (password: string) => /[A-Za-z]/.test(password),
  },
  { id: "digit", label: "At least one digit", test: (password: string) => /\d/.test(password) },
  {
    id: "symbol",
    label: "At least one symbol",
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
      <p className="text-xs text-muted-foreground">Strength: {level.label}</p>
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
              {hint.label}
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

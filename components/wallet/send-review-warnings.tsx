import { Lock, ShieldAlert, UserCheck } from "lucide-react";
import type { SendWarning } from "@/lib/ui/send-review-warnings";
import { CCX_PRECISION_DECIMAL_DISPLAY, cn, formatCcx } from "@/lib/utils";

/** Render the Send confirm-dialog safety warnings (see `deriveSendWarnings`). */
export function SendReviewWarnings({ warnings }: { warnings: SendWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <ul className="space-y-2">
      {warnings.map((warning) => (
        <WarningRow key={warning.kind} warning={warning} />
      ))}
    </ul>
  );
}

function WarningRow({ warning }: { warning: SendWarning }) {
  if (warning.kind === "self-send") {
    return (
      <Row tone="amber" icon={ShieldAlert} srPrefix="Warning:">
        You&apos;re sending to your own wallet address.
      </Row>
    );
  }
  if (warning.kind === "address-book-match") {
    return (
      <Row tone="incoming" icon={UserCheck} srPrefix="Note:">
        Recipient is saved as <span className="font-semibold text-foreground">{warning.label}</span>{" "}
        in your address book.
      </Row>
    );
  }
  return (
    <Row tone="amber" icon={Lock} srPrefix="Warning:">
      This exceeds your available balance — {formatCcx(warning.ccx, CCX_PRECISION_DECIMAL_DISPLAY)}{" "}
      is locked in deposits until maturity.
    </Row>
  );
}

const toneClasses = {
  amber: "border-wallet-amber/30 bg-wallet-amber/10 text-wallet-amber",
  incoming: "border-wallet-incoming/30 bg-wallet-incoming/10 text-wallet-incoming",
} as const;

function Row({
  tone,
  icon: Icon,
  srPrefix,
  children,
}: {
  tone: keyof typeof toneClasses;
  icon: typeof Lock;
  /** Visually-hidden context so screen readers don't rely on colour/icon alone. */
  srPrefix: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        toneClasses[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="sr-only">{srPrefix} </span>
        {children}
      </span>
    </li>
  );
}

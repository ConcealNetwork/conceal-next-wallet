/**
 * App toast helper (#120) — a drop-in wrapper over sonner that standardizes
 * per-variant durations so important toasts don't auto-vanish too fast (errors
 * linger; successes are quick). Theming + the dismiss (×) button are configured
 * once on `<Toaster>` in app-providers (richColors + the wallet-palette CSS vars).
 *
 * Use everywhere instead of importing `toast` from "sonner": same API, just
 * `import { toast } from "@/lib/ui/toast"`. A per-call `duration` still overrides
 * the variant default (e.g. a sticky error with `duration: Infinity`).
 */
import { toast as sonner } from "sonner";

type SuccessArgs = Parameters<typeof sonner.success>;
type Message = SuccessArgs[0];
type Options = SuccessArgs[1];
type ToastId = ReturnType<typeof sonner.success>;

// Errors linger (easy to miss + usually actionable); warnings sit a bit longer than
// the neutral default; successes are quick. The Toaster's global `duration` is the
// fallback for anything not routed through here.
const VARIANT_DURATION = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
} as const;

function withDuration(variant: keyof typeof VARIANT_DURATION, options?: Options): Options {
  return { duration: VARIANT_DURATION[variant], ...options };
}

function base(message: Parameters<typeof sonner>[0], options?: Parameters<typeof sonner>[1]) {
  return sonner(message, options);
}

/** Drop-in replacement for sonner's `toast` with standardized variant durations. */
export const toast = Object.assign(base, {
  success: (message: Message, options?: Options): ToastId =>
    sonner.success(message, withDuration("success", options)),
  error: (message: Message, options?: Options): ToastId =>
    sonner.error(message, withDuration("error", options)),
  info: (message: Message, options?: Options): ToastId =>
    sonner.info(message, withDuration("info", options)),
  warning: (message: Message, options?: Options): ToastId =>
    sonner.warning(message, withDuration("warning", options)),
  // Pass-throughs (no duration override): keep the full sonner surface available
  // so this is a genuine drop-in (incl. getHistory/getToasts).
  message: sonner.message,
  loading: sonner.loading,
  promise: sonner.promise,
  custom: sonner.custom,
  dismiss: sonner.dismiss,
  getHistory: sonner.getHistory,
  getToasts: sonner.getToasts,
});

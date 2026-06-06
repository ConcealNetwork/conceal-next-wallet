import { BackNav } from "@/components/layout/back-nav";

/** Sticky top-right back control for the legal pages. Thin wrapper over the
 *  shared {@link BackNav} so legal and onboarding share one implementation. */
export function LegalBackNav({ className }: { className?: string }) {
  return <BackNav sticky className={className} />;
}

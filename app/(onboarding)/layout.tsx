import { OnboardingGuard } from "@/components/layout/guards"

/** The onboarding group only guards the session here. The constrained shell +
 *  footer now lives in OnboardingShell, applied per-route by /create and
 *  /import, so the landing page (/) can render full-bleed. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingGuard>{children}</OnboardingGuard>
}

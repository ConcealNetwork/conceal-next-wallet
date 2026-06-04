import { OnboardingShell } from "@/components/layout/onboarding-shell";

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell>{children}</OnboardingShell>;
}

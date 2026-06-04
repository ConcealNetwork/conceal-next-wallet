import { OnboardingShell } from "@/components/layout/onboarding-shell";

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell>{children}</OnboardingShell>;
}

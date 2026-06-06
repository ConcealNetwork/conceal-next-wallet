import { Footer } from "@/components/layout/footer";
import { OnboardingHeader } from "@/components/layout/onboarding-header";

/** Header + constrained content column + integrated footer for the onboarding
 *  form routes (/create, /import). The landing page (/) opts out of this so it
 *  can render full-bleed with its own hero treatment. */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <OnboardingHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex-1">{children}</div>
        <Footer inline />
      </main>
    </div>
  );
}

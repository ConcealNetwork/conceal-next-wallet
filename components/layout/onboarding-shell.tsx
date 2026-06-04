import { Footer } from "@/components/layout/footer";

/** Constrained shell + legal footer for the onboarding form routes
 *  (/create, /import). The landing page (/) opts out of this so it can render
 *  full-bleed with its own hero treatment. */
export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </main>
  );
}

import { Footer } from "@/components/layout/footer";
import { LegalBackNav } from "@/components/legal/legal-back-nav";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-16 sm:px-6 lg:px-8">
        <LegalBackNav />
        {children}
      </div>
      <Footer />
    </main>
  );
}

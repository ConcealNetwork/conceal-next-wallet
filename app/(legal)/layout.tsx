import { Footer } from "@/components/layout/footer"

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        {children}
        <Footer />
      </div>
    </main>
  )
}

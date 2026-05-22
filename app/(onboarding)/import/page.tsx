import { ImportMethodCards } from "@/app/(onboarding)/onboarding-actions"

export default function ImportHubPage() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Import Wallet</h1>
      <p className="mt-2 text-muted-foreground">Choose a mock import method. No seed or key material is validated.</p>
      <div className="mt-8">
        <ImportMethodCards />
      </div>
    </div>
  )
}

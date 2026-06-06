import { ImportMethodCards } from "@/app/(onboarding)/onboarding-actions";

export default function ImportHubPage() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Import Wallet</h1>
      <p className="mt-2 text-muted-foreground">
        Choose how to restore your wallet — from a recovery phrase, your spend and view keys, an
        encrypted backup file, or a wallet QR code.
      </p>
      <div className="mt-8">
        <ImportMethodCards />
      </div>
    </div>
  );
}

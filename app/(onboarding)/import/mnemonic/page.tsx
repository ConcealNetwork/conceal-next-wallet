"use client";

import { ImportMnemonicForm } from "@/app/(onboarding)/onboarding-actions";
import { SectionCard } from "@/components/wallet/common";

export default function ImportMnemonicPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from Mnemonic">
        <ImportMnemonicForm />
      </SectionCard>
    </div>
  );
}

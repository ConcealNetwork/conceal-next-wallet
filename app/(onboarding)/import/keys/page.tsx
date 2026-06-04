"use client";

import { ImportKeysForm } from "@/app/(onboarding)/onboarding-actions";
import { SectionCard } from "@/components/wallet/common";

export default function ImportKeysPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from Keys">
        <ImportKeysForm />
      </SectionCard>
    </div>
  );
}

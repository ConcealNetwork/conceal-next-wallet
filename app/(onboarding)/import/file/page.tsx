"use client"

import { ImportFileForm } from "@/app/(onboarding)/onboarding-actions"
import { SectionCard } from "@/components/wallet/common"

export default function ImportFilePage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from File">
        <ImportFileForm />
      </SectionCard>
    </div>
  )
}

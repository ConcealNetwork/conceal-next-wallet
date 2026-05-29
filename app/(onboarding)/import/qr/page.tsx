"use client"

import { ImportQrForm } from "@/app/(onboarding)/onboarding-actions"
import { SectionCard } from "@/components/wallet/common"

export default function ImportQrPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from QR">
        <ImportQrForm />
      </SectionCard>
    </div>
  )
}

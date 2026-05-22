import { ScanLine } from "lucide-react"
import { MockImportButton } from "@/app/(onboarding)/onboarding-actions"
import { SectionCard } from "@/components/wallet/common"

export default function ImportQrPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from QR" description="Camera scanning is represented by this placeholder only.">
        <div className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950">
          <div className="text-center">
            <ScanLine className="mx-auto size-12 text-zinc-600" aria-hidden="true" />
            <p className="mt-3 text-zinc-400">Scan placeholder</p>
          </div>
        </div>
        <div className="mt-4">
          <MockImportButton method="qr" />
        </div>
      </SectionCard>
    </div>
  )
}

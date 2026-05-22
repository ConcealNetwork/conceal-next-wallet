import { MockImportButton } from "@/app/(onboarding)/onboarding-actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionCard } from "@/components/wallet/common"

export default function ImportFilePage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from File" description="The selected .wallet file is not parsed. This is a mock control.">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Wallet file</Label>
            <Input type="file" accept=".wallet" />
          </div>
          <MockImportButton method="file" />
        </div>
      </SectionCard>
    </div>
  )
}

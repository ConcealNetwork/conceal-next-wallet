import { MockImportButton } from "@/app/(onboarding)/onboarding-actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionCard } from "@/components/wallet/common"

export default function ImportKeysPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from Keys">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Spend key</Label>
            <Input placeholder="mock spend key placeholder" />
          </div>
          <div className="space-y-2">
            <Label>View key</Label>
            <Input placeholder="mock view key placeholder" />
          </div>
          <MockImportButton method="keys" />
        </div>
      </SectionCard>
    </div>
  )
}

import { MockImportButton } from "@/app/(onboarding)/onboarding-actions"
import { Textarea } from "@/components/ui/textarea"
import { SectionCard } from "@/components/wallet/common"

export default function ImportMnemonicPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Import from Mnemonic">
        <Textarea rows={8} placeholder="25-word placeholder mnemonic. Mock only." />
        <div className="mt-4">
          <MockImportButton method="mnemonic" />
        </div>
      </SectionCard>
    </div>
  )
}

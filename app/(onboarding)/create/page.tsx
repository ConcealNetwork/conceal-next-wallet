"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SectionCard } from "@/components/wallet/common"
import { services } from "@/lib/services"
import { useWalletSession } from "@/lib/session/wallet-session"
import { walletCopy } from "@/lib/ui/wallet-copy"

const createSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
  password: z.string().min(8, "Use at least 8 characters"),
})

type CreateForm = z.infer<typeof createSchema>

export default function CreateWalletPage() {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [mnemonic, setMnemonic] = useState("")
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", password: "" },
  })

  async function submit(values: CreateForm) {
    const result = await services.wallet.createWallet(values)
    setMnemonic(result.mnemonic)
    openSession(result.wallet)
  }

  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard
        title="Create Wallet"
        description={walletCopy.createWalletDescription}
      >
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label>Wallet name</Label>
            <Input {...form.register("name")} placeholder="My CCX wallet" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" {...form.register("password")} />
          </div>
          {mnemonic && (
            <div className="rounded-xl border border-wallet-amber bg-wallet-amber/10 p-4">
              <p className="text-sm font-semibold text-primary">{walletCopy.mnemonicTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">{walletCopy.mnemonicHint}</p>
              <p className="mt-2 font-mono text-sm text-foreground">{mnemonic}</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button type="submit">
              Generate
            </Button>
            {mnemonic && (
              <Button type="button" variant="outline" onClick={() => router.push("/wallet/account")}>
                Confirm and Open
              </Button>
            )}
          </div>
        </form>
      </SectionCard>
    </div>
  )
}

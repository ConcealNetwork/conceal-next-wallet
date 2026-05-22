"use client"

import { ArrowRight, FileKey, KeyRound, QrCode, Upload, Wallet } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { services } from "@/lib/services"
import { useWalletSession } from "@/lib/session/wallet-session"

export function OpenWalletButton() {
  const router = useRouter()
  const { openSession } = useWalletSession()

  async function openWallet() {
    const wallet = await services.wallet.openWallet("mock-wallet")
    openSession(wallet)
    router.push("/wallet/account")
  }

  return (
    <Button type="button" className="gap-2 bg-wallet-amber text-black" onClick={openWallet}>
      Open Wallet
      <ArrowRight className="size-4" aria-hidden="true" />
    </Button>
  )
}

export const importMethods = [
  { href: "/import/mnemonic", label: "Mnemonic", icon: FileKey, description: "Import placeholder seed words." },
  { href: "/import/keys", label: "Keys", icon: KeyRound, description: "Enter placeholder spend and view keys." },
  { href: "/import/file", label: "File", icon: Upload, description: "Pick a .wallet file for mock parsing." },
  { href: "/import/qr", label: "QR", icon: QrCode, description: "Use the scan placeholder." },
]

export function ImportMethodCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {importMethods.map((method) => {
        const Icon = method.icon
        return (
          <Link key={method.href} href={method.href}>
            <Card className="wallet-card h-full transition hover:border-wallet-amber">
              <CardContent className="flex h-full items-start gap-4">
                <div className="rounded-xl bg-wallet-amber p-3 text-black">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">{method.label}</h2>
                  <p className="mt-2 text-sm text-zinc-500">{method.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

export function MockImportButton({ method }: { method: "mnemonic" | "keys" | "file" | "qr" }) {
  const router = useRouter()
  const { openSession } = useWalletSession()

  async function submit() {
    const wallet = await services.wallet.importWallet({ method })
    openSession(wallet)
    toast.success("Mock wallet imported.")
    router.push("/wallet/account")
  }

  return (
    <Button type="button" className="w-full bg-wallet-amber text-black" onClick={submit}>
      Open Mock Wallet
    </Button>
  )
}

export function WalletIconHeader() {
  return (
    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-wallet-amber text-black">
      <Wallet className="size-7" aria-hidden="true" />
    </div>
  )
}

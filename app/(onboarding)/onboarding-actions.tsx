"use client"

import Link from "next/link"
import { FileKey, KeyRound, QrCode, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { services } from "@/lib/services"
import type { ImportWalletInput } from "@/lib/services/wallet.service"
import { useWalletSession } from "@/lib/session/wallet-session"
import { importFieldsRequired, walletCopy } from "@/lib/ui/wallet-copy"

const importMethods = [
  { href: "/import/mnemonic", label: "Mnemonic", icon: FileKey, description: "Restore from 25-word seed phrase." },
  { href: "/import/keys", label: "Keys", icon: KeyRound, description: "Import spend and view keys." },
  { href: "/import/file", label: "File", icon: Upload, description: "Open an encrypted .wallet file." },
  { href: "/import/qr", label: "QR", icon: QrCode, description: "Import from a wallet QR payload." },
]

export function ImportMethodCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {importMethods.map((method) => {
        const Icon = method.icon
        return (
          <Link
            key={method.href}
            href={method.href}
            className="block cursor-pointer rounded-xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="wallet-card h-full transition-colors duration-200 hover:border-ring">
              <CardContent className="flex h-full items-start gap-4">
                <div className="rounded-xl bg-primary p-3 text-primary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">{method.label}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{method.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

function ImportSubmitButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={loading}>
      {loading ? "Importing…" : label}
    </Button>
  )
}

export function ImportKeysForm() {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [loading, setLoading] = useState(false)
  const [address, setAddress] = useState("")
  const [viewOnly, setViewOnly] = useState(false)
  const [privateViewKey, setPrivateViewKey] = useState("")
  const [privateSpendKey, setPrivateSpendKey] = useState("")
  const [password, setPassword] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const input: ImportWalletInput = {
        method: "keys",
        address,
        viewOnly,
        privateViewKey,
        privateSpendKey,
        password,
      }
      const wallet = await services.wallet.importWallet(input)
      openSession(wallet)
      toast.success("Wallet imported.")
      router.push("/wallet/account")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Address</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} required={importFieldsRequired} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={viewOnly} onChange={(e) => setViewOnly(e.target.checked)} />
        View-only wallet
      </label>
      {!viewOnly && (
        <div className="space-y-2">
          <Label>Spend key</Label>
          <Input value={privateSpendKey} onChange={(e) => setPrivateSpendKey(e.target.value)} />
        </div>
      )}
      <div className="space-y-2">
        <Label>View key</Label>
        <Input value={privateViewKey} onChange={(e) => setPrivateViewKey(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Encryption password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  )
}

export function ImportMnemonicForm() {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [loading, setLoading] = useState(false)
  const [mnemonic, setMnemonic] = useState("")
  const [password, setPassword] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const wallet = await services.wallet.importWallet({
        method: "mnemonic",
        mnemonic,
        password,
        language: "auto",
      })
      openSession(wallet)
      toast.success("Wallet imported.")
      router.push("/wallet/account")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Mnemonic</Label>
        <Input value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} required={importFieldsRequired} />
      </div>
      <div className="space-y-2">
        <Label>Encryption password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  )
}

export function ImportFileForm() {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState("")
  const [file, setFile] = useState<ArrayBuffer | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const wallet = await services.wallet.importWallet({ method: "file", file: file!, password })
      openSession(wallet)
      toast.success("Wallet imported.")
      router.push("/wallet/account")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Wallet file</Label>
        <Input
          type="file"
          accept=".json,.wallet,application/json"
          onChange={async (event) => {
            const selected = event.target.files?.[0]
            setFile(selected ? await selected.arrayBuffer() : null)
          }}
          required={importFieldsRequired}
        />
      </div>
      <div className="space-y-2">
        <Label>File password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  )
}

export function ImportQrForm() {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState("")
  const [password, setPassword] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const wallet = await services.wallet.importWallet({ method: "qr", payload, password })
      openSession(wallet)
      toast.success("Wallet imported.")
      router.push("/wallet/account")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>QR payload</Label>
        <Input value={payload} onChange={(e) => setPayload(e.target.value)} required={importFieldsRequired} />
      </div>
      <div className="space-y-2">
        <Label>Encryption password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <ImportSubmitButton label={walletCopy.importWallet} loading={loading} />
    </form>
  )
}

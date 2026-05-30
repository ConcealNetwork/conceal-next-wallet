"use client"

import Link from "next/link"
import { createContext, useContext, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { env } from "@/lib/env"
import { services } from "@/lib/services"
import { useWalletSession } from "@/lib/session/wallet-session"

type OpenWalletContextValue = {
  openWallet: () => Promise<void>
}

const OpenWalletContext = createContext<OpenWalletContextValue | null>(null)

function useOpenWalletContext() {
  const context = useContext(OpenWalletContext)
  if (!context) {
    throw new Error("Open wallet controls must be used inside OpenWalletProvider")
  }
  return context
}

/** Renders unlock and no-wallet dialogs for all landing open-wallet buttons. */
export function OpenWalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { openSession } = useWalletSession()
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [noWalletDialogOpen, setNoWalletDialogOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function unlock(passwordValue?: string) {
    setLoading(true)
    try {
      const wallet = await services.wallet.openWallet(
        env.useMockWallet ? {} : { password: passwordValue },
      )
      openSession(wallet)
      setUnlockDialogOpen(false)
      setPassword("")
      router.push("/wallet/account")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open wallet.")
    } finally {
      setLoading(false)
    }
  }

  async function openWallet() {
    if (env.useMockWallet) {
      await unlock()
      return
    }

    const hasStored = await services.wallet.hasStoredWallet()
    if (!hasStored) {
      setNoWalletDialogOpen(true)
      return
    }

    setUnlockDialogOpen(true)
  }

  return (
    <OpenWalletContext.Provider value={{ openWallet }}>
      {children}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open wallet</DialogTitle>
            <DialogDescription>Enter your encryption password to unlock the wallet on this device.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void unlock(password)
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="landing-open-password">Password</Label>
              <Input
                id="landing-open-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUnlockDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Opening…" : "Open Wallet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={noWalletDialogOpen} onOpenChange={setNoWalletDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No wallet found</DialogTitle>
            <DialogDescription>
              There is no encrypted wallet on this device yet. Import an existing wallet or create a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3 sm:flex-col sm:space-x-0">
            <Button asChild className="w-full">
              <Link href="/import" onClick={() => setNoWalletDialogOpen(false)}>
                Import wallet
              </Link>
            </Button>
            <Link
              href="/create"
              onClick={() => setNoWalletDialogOpen(false)}
              className="cursor-pointer text-center text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              Create a new one →
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OpenWalletContext.Provider>
  )
}

/** Primary hero CTAs: open the wallet, or go create a new one. */
export function LandingActions() {
  const { openWallet } = useOpenWalletContext()

  return (
    <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-4">
      <button
        type="button"
        onClick={() => void openWallet()}
        className="cursor-pointer rounded-full bg-primary px-7 py-4 text-[15px] font-semibold text-primary-foreground transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(255,165,0,0.3)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open your wallet
      </button>
      <Link
        href="/create"
        className="cursor-pointer rounded-sm text-[14.5px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        Create a new one →
      </Link>
    </div>
  )
}

/** Compact "Open Wallet" pill used in the landing nav. */
export function NavOpenWalletButton() {
  const { openWallet } = useOpenWalletContext()

  return (
    <button
      type="button"
      onClick={() => void openWallet()}
      className="cursor-pointer rounded-full border border-border px-[17px] py-[9px] text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      Open Wallet
    </button>
  )
}

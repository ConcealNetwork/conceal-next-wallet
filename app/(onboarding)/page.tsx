import Link from "next/link"
import { OpenWalletButton, WalletIconHeader } from "@/app/(onboarding)/onboarding-actions"

export default function LandingPage() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <WalletIconHeader />
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-wallet-amber">Conceal Web Wallet v2</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-tight text-white">
        The next generation wallet is here
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-zinc-400">
        Mock-only recreation of the Conceal CCX wallet interface.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <OpenWalletButton />
        <Link className="inline-flex h-10 items-center rounded-xl border border-zinc-800 px-4 text-sm font-semibold text-white" href="/create">
          Create Wallet
        </Link>
        <Link className="inline-flex h-10 items-center rounded-xl border border-zinc-800 px-4 text-sm font-semibold text-white" href="/import">
          Import Wallet
        </Link>
      </div>
      <a className="mt-6 text-sm font-semibold text-wallet-amber" href="https://discord.gg/YbpHVSd" rel="noreferrer" target="_blank">
        Join Discord
      </a>
    </section>
  )
}

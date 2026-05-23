import Link from "next/link"
import { OpenWalletButton, WalletIconHeader } from "@/app/(onboarding)/onboarding-actions"

export default function LandingPage() {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <WalletIconHeader />
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Conceal Web Wallet v2</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-bold tracking-tight text-white">
        The next generation wallet is here
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Mock-only recreation of the Conceal CCX wallet interface.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <OpenWalletButton />
        <Link
          className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold text-white transition-colors duration-200 hover:border-ring hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          href="/create"
        >
          Create Wallet
        </Link>
        <Link
          className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold text-white transition-colors duration-200 hover:border-ring hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          href="/import"
        >
          Import Wallet
        </Link>
      </div>
      <a
        className="mt-6 inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        href="https://discord.gg/YbpHVSd"
        rel="noreferrer"
        target="_blank"
      >
        Join Discord
      </a>
    </section>
  )
}

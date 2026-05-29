import Image from "next/image"
import { ConcealBackdrop } from "@/components/landing/conceal-backdrop"
import { LandingActions, NavOpenWalletButton, OpenWalletProvider } from "@/components/landing/landing-actions"
import { LandingBalanceCard } from "@/components/landing/landing-balance-card"

const trustPoints = [
  "Untraceable transactions",
  "Encrypted messaging",
  "Deposits that earn",
  "Keys never leave your device",
]

export default function LandingPage() {
  return (
    <OpenWalletProvider>
    <main className="relative min-h-screen overflow-x-hidden text-foreground">
      <ConcealBackdrop />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1240px] flex-col px-6 sm:px-10 lg:px-14">
        {/* nav */}
        <header className="flex h-[92px] items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/brand/conceal-mark.svg" width={25} height={25} alt="Conceal" priority />
            <b className="text-base font-semibold">Conceal</b>
          </div>
          <nav className="flex items-center gap-6 sm:gap-8">
            <a
              href="https://discord.gg/YbpHVSd"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Discord
            </a>
            <a
              href="https://github.com/ConcealNetwork"
              target="_blank"
              rel="noreferrer"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              GitHub
            </a>
            <NavOpenWalletButton />
          </nav>
        </header>

        {/* hero */}
        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-[0.26em] text-primary">
              Conceal Web Wallet
            </p>
            <h1 className="mt-6 text-balance text-5xl font-light leading-[1.0] tracking-[-0.035em] sm:text-6xl lg:text-[74px]">
              Quietly <em className="not-italic text-primary">private.</em>
              <br />
              Patiently <b className="font-semibold">yours.</b>
            </h1>
            <p className="mt-7 max-w-[440px] text-lg leading-relaxed text-muted-foreground">
              A non-custodial wallet where untraceable payments, encrypted messages, and
              interest-earning deposits feel effortless — and entirely your own.
            </p>
            <LandingActions />
          </div>

          <div className="flex justify-center lg:justify-end">
            <LandingBalanceCard />
          </div>
        </section>

        {/* trust strip */}
        <footer className="flex flex-wrap gap-x-9 gap-y-3 border-t border-border py-7">
          {trustPoints.map((point) => (
            <span
              key={point}
              className="flex items-center gap-2.5 text-[13px] font-medium text-muted-foreground"
            >
              <i className="size-[5px] rounded-full bg-primary" />
              {point}
            </span>
          ))}
        </footer>
      </div>
    </main>
    </OpenWalletProvider>
  )
}

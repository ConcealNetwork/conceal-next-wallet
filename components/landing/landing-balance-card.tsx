/** The hero balance card — sample wallet data, presentational only.
 *  Uses the shared glass `wallet-card` surface plus a signature orange corner
 *  glow that marks it as the page's focal element. */
export function LandingBalanceCard() {
  return (
    <div className="wallet-card relative w-full max-w-[430px] overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 100% 0%, hsl(39 100% 50% / 0.10), transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.04em] text-muted-foreground">
            Total Balance
          </span>
          <span className="rounded-full border border-wallet-incoming/30 bg-wallet-incoming/10 px-2.5 py-1 font-mono text-[11px] text-wallet-incoming">
            ● Synced
          </span>
        </div>

        <div className="mt-4 font-mono text-[42px] font-medium leading-none tracking-tight">
          48,250.00<span className="ml-1.5 text-[22px] text-primary">CCX</span>
        </div>
        <div className="mt-1 font-mono text-sm text-muted-foreground/70">
          ≈ $2,317.40 · last 24h +1.8%
        </div>

        <div className="mt-5 flex gap-3">
          <div className="flex-1 rounded-xl border border-border bg-white/[0.025] px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
              Available
            </div>
            <div className="mt-1.5 font-mono text-base font-medium">31,250.00</div>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-white/[0.025] px-3.5 py-3">
            <div className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
              Locked
            </div>
            <div className="mt-1.5 font-mono text-base font-medium text-wallet-incoming">
              17,000.00
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">Term Deposit · 90 days</span>
            <span className="font-mono text-[13px] text-primary">+6.0% APR</span>
          </div>
          <div className="mt-3 h-[7px] overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-[68%] rounded-full bg-linear-to-r from-primary to-[#ffc266]" />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11.5px] text-muted-foreground/70">
            <span>17,000 CCX locked</span>
            <span>29 days left</span>
          </div>
        </div>
      </div>
    </div>
  );
}

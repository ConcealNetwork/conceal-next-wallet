"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CcxAmount } from "@/components/wallet/ccx";
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common";
import { useDeposits, useTransactions, useWalletInfo } from "@/lib/hooks";
import { CoinUri } from "@/lib/wallet-core/CoinUri";
import { formatCcx, timeAgo, truncateAddress } from "@/lib/utils";

export default function ReceivePage() {
  const wallet = useWalletInfo();
  const transactions = useTransactions();
  const deposits = useDeposits();
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [message, setMessage] = useState("");
  const [v1Qr, setV1Qr] = useState(false);

  const address = wallet.data?.address ?? "";
  const hasRequest = Boolean(amount || paymentId || message);
  const paymentUri = useMemo(() => {
    if (!address) return "";
      return CoinUri.encodeTx(
        address,
        paymentId || null,
        amount || null,
        null,
        message || null,
        v1Qr ? "v1" : "v3",
      );
  }, [address, amount, message, paymentId, v1Qr]);
  const received = (transactions.data ?? [])
    .filter((transaction) => transaction.type === "receive")
    .slice(0, 5);
  const depositHistory = (deposits.data ?? []).slice(0, 5);

  return (
    <>
      <PageHeader title="Receive CCX" subtitle="Share your address or QR code to receive funds" />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
            <SectionCard
              title="Your Wallet Address"
              description="Share this address or QR to receive funds"
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-4">
                  <p className="break-all rounded-xl bg-secondary p-4 font-mono text-sm text-foreground">
                    {address}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <CopyButton value={address} label="Copy Address" />
                    <div className="flex items-center gap-2">
                      <Switch
                        id="v1-qr"
                        checked={v1Qr}
                        onCheckedChange={setV1Qr}
                        aria-label="QR encode for V1"
                      />
                      <Label htmlFor="v1-qr" className="cursor-pointer text-sm font-normal">
                        QR encode for V1
                      </Label>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {v1Qr
                      ? hasRequest
                        ? `QR now encodes a payment request${amount ? ` for ${amount} CCX` : ""}, no prefix: compatible with web wallet V1.`
                        : "QR encodes your address with no prefix — compatible with web wallet V1."
                      : hasRequest
                        ? `QR now encodes a payment request${amount ? ` for ${amount} CCX` : ""}.`
                        : "Scan the QR to send CCX to this address."}
                  </p>
                </div>
                <div className="mx-auto shrink-0 rounded-2xl bg-white p-4">
                  <WalletQrCode value={paymentUri} size={180} />
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard
              title="Request a Payment"
              description="Optionally encode an amount, payment ID, and message"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="req-amount">Amount (CCX)</Label>
                  <Input
                    id="req-amount"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-paymentId">Payment ID</Label>
                  <Input
                    id="req-paymentId"
                    value={paymentId}
                    onChange={(event) => setPaymentId(event.target.value)}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="req-message">Message</Label>
                  <Textarea
                    id="req-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Optional note for the sender"
                  />
                </div>
              </div>
              {hasRequest ? (
                <div className="mt-4 space-y-3 rounded-xl bg-secondary p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Payment link
                  </p>
                  <p className="break-all font-mono text-sm text-foreground">{paymentUri}</p>
                  <CopyButton value={paymentUri} label="Copy Payment Link" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Fill any field above to generate a shareable payment link and update the QR.
                </p>
              )}
            </SectionCard>
          </div>
        </div>

        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
            <SectionCard
              title="Recently Received"
              description="Last 5 incoming"
              footer={
                <Link
                  className="inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  href="/wallet/transactions"
                >
                  View all transactions →
                </Link>
              }
            >
              {received.length > 0 ? (
                <ul className="divide-y divide-border">
                  {received.map((transaction) => (
                    <li
                      key={transaction.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm">
                          {truncateAddress(transaction.address)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(transaction.timestamp)}
                        </p>
                      </div>
                      <p className="font-mono text-sm font-semibold text-wallet-incoming">
                        +<CcxAmount>{formatCcx(transaction.amount)}</CcxAmount>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No incoming transactions yet.</p>
              )}
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:210ms]">
            <SectionCard title="Deposit History" description="Last 5 deposits">
              {depositHistory.length > 0 ? (
                <ul className="divide-y divide-border">
                  {depositHistory.map((deposit) => (
                    <li
                      key={deposit.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <span className="text-sm text-muted-foreground">
                        {deposit.durationMonths} months
                      </span>
                      <span className="font-mono text-sm font-semibold text-wallet-deposit">
                        +<CcxAmount>{formatCcx(deposit.amount)}</CcxAmount>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No deposits yet.</p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}

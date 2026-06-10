"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CcxAmount } from "@/components/wallet/ccx";
import { AddressQrScanButton } from "@/components/qr/address-qr-scan-button";
import {
  AddressBookContactPicker,
  findAddressBookContactByAddress,
} from "@/components/wallet/address-book-contact-picker";
import { CopyButton, PageHeader, SectionCard, WalletQrCode } from "@/components/wallet/common";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import type { ScannedSendDraft } from "@/lib/ui/parse-scanned-send-payload";
import { walletNetworkScalars } from "@/lib/config/config";
import { useCountUp } from "@/lib/hooks/use-count-up";
import {
  useMarketData,
  useAddressBook,
  useSendTransaction,
  useTransactions,
  useWalletInfo,
  useWalletSyncStatus,
} from "@/lib/hooks";
import type { AddressEntry } from "@/lib/types";
import { parsePaymentSendDraft } from "@/lib/ui/payment-link";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { isSendToSelf } from "@/lib/validation/ccx";
import {
  ccxToNumber,
  CCX_PRECISION_DECIMAL_DISPLAY,
  formatCcx,
  formatUsd,
  timeAgo,
  truncateAddress,
} from "@/lib/utils";

const NETWORK_FEE = walletNetworkScalars.coinFeeAtomic / 10 ** walletNetworkScalars.coinUnitPlaces;
const REMOTE_NODE_FEE =
  walletNetworkScalars.remoteNodeFeeAtomic / 10 ** walletNetworkScalars.coinUnitPlaces;
const SEND_FEE = NETWORK_FEE + REMOTE_NODE_FEE;

const sendSchema = z.object({
  address: z
    .string()
    .regex(/^ccx7/, "CCX addresses start with ccx7")
    .min(90, "A CCX address is ~98 characters"),
  amount: z.number().positive("Amount must be greater than zero"),
  paymentId: z
    .string()
    .regex(/^[0-9a-fA-F]*$/, "Payment ID must be hexadecimal")
    .max(64, "Max 64 characters")
    .optional(),
  message: z.string().max(255, "Max 255 characters").optional(),
});

type SendForm = z.infer<typeof sendSchema>;

export default function SendPage() {
  const wallet = useWalletInfo();
  const { isSyncing } = useWalletSyncStatus();
  const addressBook = useAddressBook();
  const market = useMarketData();
  const transactions = useTransactions();
  const send = useSendTransaction();
  const [review, setReview] = useState<SendForm | null>(null);
  const [selfSendFromLink, setSelfSendFromLink] = useState<SendForm | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [paymentLinkApplied, setPaymentLinkApplied] = useState(false);

  const available = wallet.data ? ccxToNumber(wallet.data.available) : 0;
  const price = market.data?.price.value ?? 0;
  const availableLabel = useCountUp(available, {
    formatter: (value) => formatCcx(value, CCX_PRECISION_DECIMAL_DISPLAY),
  });

  const form = useForm<SendForm>({
    resolver: zodResolver(sendSchema),
    defaultValues: { address: "", amount: 0, paymentId: "", message: "" },
  });

  const amount = useWatch({ control: form.control, name: "amount" }) || 0;
  const message = useWatch({ control: form.control, name: "message" }) || "";
  const address = useWatch({ control: form.control, name: "address" }) || "";
  const sendToSelf = isSendToSelf(address, wallet.data?.address ?? "");
  const recentSent = (transactions.data ?? [])
    .filter((transaction) => transaction.type === "send")
    .slice(0, 5);

  useEffect(() => {
    const match = findAddressBookContactByAddress(addressBook.data ?? [], address);
    setSelectedContactId(match?.id ?? null);
  }, [address, addressBook.data]);

  useEffect(() => {
    if (paymentLinkApplied) return;
    const draft = parsePaymentSendDraft();
    if (!draft) return;
    const walletAddress = wallet.data?.address;
    if (!walletAddress) return;

    const values: SendForm = {
      address: draft.address,
      amount: draft.amount,
      paymentId: draft.paymentId ?? "",
      message: draft.message ?? "",
    };
    form.reset(values);
    setPaymentLinkApplied(true);

    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    if (isSendToSelf(draft.address, walletAddress)) {
      setSelfSendFromLink(values);
    } else {
      setReview(values);
      toast.success("Payment request loaded — confirm to send.");
    }
  }, [form, paymentLinkApplied, wallet.data?.address]);

  function pickContact(entry: AddressEntry | null) {
    setSelectedContactId(entry?.id ?? null);
    form.setValue("address", entry?.address ?? "", { shouldValidate: true });
  }

  function applyScannedSendDraft(draft: ScannedSendDraft) {
    form.setValue("address", draft.address, { shouldValidate: true });
    if (draft.amount !== undefined && draft.amount > 0) {
      form.setValue("amount", draft.amount, { shouldValidate: true });
    }
    if (draft.paymentId) {
      form.setValue("paymentId", draft.paymentId, { shouldValidate: true });
    }
    if (draft.message) {
      form.setValue("message", draft.message, { shouldValidate: true });
    }
    const match = findAddressBookContactByAddress(addressBook.data ?? [], draft.address);
    setSelectedContactId(match?.id ?? null);
  }

  function confirmSend() {
    if (!review) return;
    send.mutate(review, {
      onSuccess: () => {
        toast.success(walletCopy.sendSuccess);
        form.reset();
        setSelectedContactId(null);
        setReview(null);
      },
    });
  }

  return (
    <>
      <PageHeader title="Send CCX" subtitle="Transfer Conceal Coins to another address" />
      <WalletSyncingBanner />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <SectionCard
            title="Send Transaction"
            description="All fields are required except Payment ID and Message"
          >
            <form className="space-y-5" onSubmit={form.handleSubmit((values) => setReview(values))}>
              <div className="space-y-2">
                <Label htmlFor="address">Destination Address</Label>
                <AddressBookContactPicker
                  contacts={addressBook.data ?? []}
                  selectedId={selectedContactId}
                  onSelect={pickContact}
                />
                <div className="relative">
                  <Input
                    id="address"
                    placeholder="ccx7 ..."
                    autoComplete="off"
                    className="max-sm:pr-10"
                    {...form.register("address")}
                  />
                  <AddressQrScanButton
                    className="absolute right-1 top-1/2 -translate-y-1/2 sm:hidden"
                    disabled={send.isPending}
                    onScan={applyScannedSendDraft}
                  />
                </div>
                {form.formState.errors.address ? (
                  <p className="text-sm text-wallet-outgoing">
                    {form.formState.errors.address.message}
                  </p>
                ) : sendToSelf ? (
                  <p className="text-sm text-wallet-amber">
                    Cannot send to your own wallet address
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Enter the recipient&apos;s CCX address (98 characters, starts with ccx7)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">Amount to Send</Label>
                  <button
                    type="button"
                    onClick={() =>
                      form.setValue(
                        "amount",
                        Number(available.toFixed(CCX_PRECISION_DECIMAL_DISPLAY)),
                        { shouldValidate: true },
                      )
                    }
                    className="cursor-pointer rounded-sm text-xs font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Max: {formatCcx(available, CCX_PRECISION_DECIMAL_DISPLAY)}
                  </button>
                </div>
                <Input
                  id="amount"
                  type="number"
                  step={10 ** -CCX_PRECISION_DECIMAL_DISPLAY}
                  placeholder={`0.${"0".repeat(CCX_PRECISION_DECIMAL_DISPLAY)}`}
                  {...form.register("amount", { valueAsNumber: true })}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">≈ {formatUsd(amount * price)} USD</span>
                  {amount + SEND_FEE > available && amount > 0 ? (
                    <span className="text-wallet-outgoing">Exceeds available balance</span>
                  ) : null}
                </div>
                {form.formState.errors.amount && (
                  <p className="text-sm text-wallet-outgoing">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentId">Payment ID (optional)</Label>
                <Input
                  id="paymentId"
                  placeholder="64 character hex string"
                  autoComplete="off"
                  {...form.register("paymentId")}
                />
                {form.formState.errors.paymentId && (
                  <p className="text-sm text-wallet-outgoing">
                    {form.formState.errors.paymentId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message (optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Optional message to include with the transaction"
                  {...form.register("message")}
                />
                <p className="text-right text-xs text-muted-foreground">{message.length}/255</p>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm">
                <span className="text-muted-foreground">Estimated fees</span>
                <span className="font-mono">
                  <CcxAmount>{formatCcx(SEND_FEE, 6)}</CcxAmount>
                </span>
              </div>

              <Button
                type="submit"
                className="w-full active:scale-[0.98] motion-reduce:active:scale-100"
                disabled={send.isPending || sendToSelf || isSyncing}
              >
                Review Send
              </Button>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard title="Available" description="Ready to spend">
              {wallet.data ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-2xl font-bold">{availableLabel}</p>
                    <p className="text-sm text-muted-foreground">
                      ≈ {formatUsd(available * price)} USD
                    </p>
                  </div>
                  <p className="break-all rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                    {wallet.data.address}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <CopyButton value={wallet.data.address} label="Copy Address" />
                    <Button asChild variant="outline">
                      <Link href="/wallet/receive">Open Receive</Link>
                    </Button>
                  </div>
                  <WalletQrCode value={wallet.data.address} size={140} />
                </div>
              ) : null}
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
            <SectionCard title="Recently Sent" description="Last 5 outgoing transactions">
              {recentSent.length > 0 ? (
                <ul className="divide-y divide-border">
                  {recentSent.map((transaction) => (
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
                      <p className="font-mono text-sm font-semibold text-wallet-outgoing">
                        −<CcxAmount>{formatCcx(transaction.amount)}</CcxAmount>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No outgoing transactions yet.</p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      <Dialog
        open={selfSendFromLink !== null}
        onOpenChange={(open) => !open && setSelfSendFromLink(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{walletCopy.sendToSelfFromLinkTitle}</DialogTitle>
            <DialogDescription>{walletCopy.sendToSelfFromLinkDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelfSendFromLink(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!selfSendFromLink) return;
                setReview(selfSendFromLink);
                setSelfSendFromLink(null);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm send</DialogTitle>
            <DialogDescription>{walletCopy.sendConfirm}</DialogDescription>
          </DialogHeader>
          {review ? (
            <div className="space-y-3 text-sm">
              <Row label="To" value={truncateAddress(review.address, 10, 8)} mono />
              <Row
                label="Amount"
                value={formatCcx(review.amount, CCX_PRECISION_DECIMAL_DISPLAY)}
                mono
              />
              <Row label="Network fee" value={formatCcx(NETWORK_FEE, 6)} mono />
              <Row label="Remote node fee" value={formatCcx(REMOTE_NODE_FEE, 6)} mono />
              <div className="my-1 border-t border-border" />
              <Row label="Total" value={formatCcx(review.amount + SEND_FEE, 6)} mono strong />
              <Row label="≈ USD" value={formatUsd((review.amount + SEND_FEE) * price)} />
              {review.paymentId ? (
                <Row label="Payment ID" value={truncateAddress(review.paymentId, 8, 6)} mono />
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSend} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${strong ? "font-semibold text-foreground" : "text-foreground"}`}
      >
        <CcxAmount>{value}</CcxAmount>
      </span>
    </div>
  );
}

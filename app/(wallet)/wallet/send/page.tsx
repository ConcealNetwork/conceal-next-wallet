"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AddressQrScanButton } from "@/components/qr/address-qr-scan-button";
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
import {
  AddressBookContactPicker,
  findAddressBookContactByAddress,
} from "@/components/wallet/address-book-contact-picker";
import { CcxAmount } from "@/components/wallet/ccx";
import { PageHeader, SectionCard, ViewOnlyBadge } from "@/components/wallet/common";
import { SendReviewWarnings } from "@/components/wallet/send-review-warnings";
import { SendRail } from "@/components/layout/rails/send-rail";
import { usePageRightRail } from "@/components/layout/right-rail";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import { MAX_MESSAGE_SIZE, walletNetworkScalars } from "@/lib/config/config";
import {
  useAddressBook,
  useMarketData,
  useSendTransaction,
  useWalletInfo,
  useWalletSyncStatus,
  useWalletViewOnly,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { AddressEntry } from "@/lib/types";
import type { ScannedSendDraft } from "@/lib/ui/parse-scanned-send-payload";
import { parsePaymentSendDraft } from "@/lib/ui/payment-link";
import { deriveSendWarnings } from "@/lib/ui/send-review-warnings";
import { walletCopy } from "@/lib/ui/wallet-copy";
import {
  CCX_PRECISION_DECIMAL_DISPLAY,
  ccxToNumber,
  formatCcx,
  formatUsd,
  truncateAddress,
} from "@/lib/utils";
import { isSendToSelf } from "@/lib/validation/ccx";

const NETWORK_FEE = walletNetworkScalars.coinFeeAtomic / 10 ** walletNetworkScalars.coinUnitPlaces;
const REMOTE_NODE_FEE =
  walletNetworkScalars.remoteNodeFeeAtomic / 10 ** walletNetworkScalars.coinUnitPlaces;
const SEND_FEE = NETWORK_FEE + REMOTE_NODE_FEE;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

// Schema factory so the localizable validation messages can be threaded through
// `t`. The address-format and message-size messages stay English by design (the
// address rules are recipient-correctness copy, kept in the source language).
function makeSendSchema(t: Translate) {
  return z.object({
    address: z
      .string()
      .regex(/^ccx7/, "CCX addresses start with ccx7")
      .min(90, "A CCX address is ~98 characters"),
    amount: z.number().positive(t("send.errAmountPositive")),
    paymentId: z
      .string()
      .regex(/^[0-9a-fA-F]*$/, t("send.errPaymentIdHex"))
      .max(64, t("send.errPaymentIdMax"))
      .optional(),
    message: z
      .string()
      .refine(
        (value) => new TextEncoder().encode(value).length <= MAX_MESSAGE_SIZE,
        `Message exceeds ${MAX_MESSAGE_SIZE} bytes`,
      )
      .optional(),
  });
}

type SendForm = z.infer<ReturnType<typeof makeSendSchema>>;

export default function SendPage() {
  const { t } = useI18n();
  usePageRightRail(<SendRail />);
  const sendSchema = useMemo(() => makeSendSchema(t), [t]);
  const wallet = useWalletInfo();
  const { isSyncing } = useWalletSyncStatus();
  const viewOnly = useWalletViewOnly();
  const addressBook = useAddressBook();
  const market = useMarketData();
  const send = useSendTransaction();
  const [review, setReview] = useState<SendForm | null>(null);
  const [selfSendFromLink, setSelfSendFromLink] = useState<SendForm | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [paymentLinkApplied, setPaymentLinkApplied] = useState(false);

  const available = wallet.data ? ccxToNumber(wallet.data.available) : 0;
  const price = market.data?.price.value ?? 0;

  const form = useForm<SendForm>({
    resolver: zodResolver(sendSchema),
    defaultValues: { address: "", amount: 0, paymentId: "", message: "" },
  });

  const amount = useWatch({ control: form.control, name: "amount" }) || 0;
  const message = useWatch({ control: form.control, name: "message" }) || "";
  const messageBytes = new TextEncoder().encode(message).length;
  const address = useWatch({ control: form.control, name: "address" }) || "";
  const sendToSelf = isSendToSelf(address, wallet.data?.address ?? "");

  const reviewContactLabel = review
    ? (findAddressBookContactByAddress(addressBook.data ?? [], review.address)?.label ?? null)
    : null;
  const sendWarnings = review
    ? deriveSendWarnings({
        recipient: review.address,
        walletAddress: wallet.data?.address ?? "",
        contactLabel: reviewContactLabel,
        lockedDepositsCcx: wallet.data ? ccxToNumber(wallet.data.lockedDeposits) : 0,
        availableCcx: available,
        sendTotalCcx: review.amount + SEND_FEE,
      })
    : [];

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

    if (viewOnly) {
      toast.error(walletCopy.viewOnlySendDisabled);
    } else if (isSendToSelf(draft.address, walletAddress)) {
      setSelfSendFromLink(values);
    } else {
      setReview(values);
      toast.success("Payment request loaded — confirm to send.");
    }
  }, [form, paymentLinkApplied, wallet.data?.address, viewOnly]);

  function pickContact(entry: AddressEntry | null) {
    setSelectedContactId(entry?.id ?? null);
    form.setValue("address", entry?.address ?? "", { shouldValidate: true });
  }

  function applyScannedDraft(draft: ScannedSendDraft) {
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
    if (viewOnly) {
      toast.error(walletCopy.viewOnlySendDisabled);
      return;
    }
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
      <PageHeader
        title={t("send.title")}
        subtitle={t("send.subtitle")}
        badge={viewOnly ? <ViewOnlyBadge /> : null}
      />
      <WalletSyncingBanner />
      <ViewOnlyBanner />
      <div className="mx-auto max-w-2xl">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <SectionCard title={t("send.formTitle")} description={t("send.formDescription")}>
            <form
              className="space-y-5"
              onSubmit={form.handleSubmit((values) => {
                if (viewOnly) {
                  toast.error(walletCopy.viewOnlySendDisabled);
                  return;
                }
                setReview(values);
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="address">{t("send.addressLabel")}</Label>
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
                    className="max-lg:pr-10"
                    aria-invalid={form.formState.errors.address ? true : undefined}
                    aria-describedby="address-hint"
                    {...form.register("address")}
                  />
                  <AddressQrScanButton
                    className="absolute right-1 top-1/2 -translate-y-1/2 lg:hidden"
                    disabled={send.isPending}
                    onScan={applyScannedDraft}
                  />
                </div>
                {/* One hint node, linked via aria-describedby. No role="alert":
                    react-hook-form focuses the first invalid field on submit, so the
                    error is read via the description — avoids assertive double-reads. */}
                {form.formState.errors.address ? (
                  <p id="address-hint" className="text-sm text-wallet-outgoing">
                    {form.formState.errors.address.message}
                  </p>
                ) : sendToSelf ? (
                  <p id="address-hint" className="text-sm text-wallet-amber">
                    Cannot send to your own wallet address
                  </p>
                ) : (
                  <p id="address-hint" className="text-xs text-muted-foreground">
                    Enter the recipient&apos;s CCX address (98 characters, starts with ccx7)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="amount">{t("send.amountLabel")}</Label>
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
                    {t("send.amountMax", {
                      amount: formatCcx(available, CCX_PRECISION_DECIMAL_DISPLAY),
                    })}
                  </button>
                </div>
                <Input
                  id="amount"
                  type="number"
                  step={10 ** -CCX_PRECISION_DECIMAL_DISPLAY}
                  placeholder={`0.${"0".repeat(CCX_PRECISION_DECIMAL_DISPLAY)}`}
                  aria-invalid={form.formState.errors.amount ? true : undefined}
                  aria-describedby={
                    form.formState.errors.amount ? "amount-help amount-error" : "amount-help"
                  }
                  {...form.register("amount", { valueAsNumber: true })}
                />
                <div id="amount-help" className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t("send.approxUsd", { usd: formatUsd(amount * price) })}
                  </span>
                  {amount + SEND_FEE > available && amount > 0 ? (
                    <span className="text-wallet-outgoing">{t("send.errExceedsBalance")}</span>
                  ) : null}
                </div>
                {form.formState.errors.amount && (
                  <p id="amount-error" className="text-sm text-wallet-outgoing">
                    {form.formState.errors.amount.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentId">{t("send.paymentIdLabel")}</Label>
                <Input
                  id="paymentId"
                  placeholder={t("send.paymentIdPlaceholder")}
                  autoComplete="off"
                  aria-invalid={form.formState.errors.paymentId ? true : undefined}
                  aria-describedby={form.formState.errors.paymentId ? "paymentId-error" : undefined}
                  {...form.register("paymentId")}
                />
                {form.formState.errors.paymentId && (
                  <p id="paymentId-error" className="text-sm text-wallet-outgoing">
                    {form.formState.errors.paymentId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">{t("send.messageLabel")}</Label>
                <Textarea
                  id="message"
                  placeholder={t("send.messagePlaceholder")}
                  aria-invalid={form.formState.errors.message ? true : undefined}
                  aria-describedby={
                    form.formState.errors.message ? "message-count message-error" : "message-count"
                  }
                  {...form.register("message")}
                />
                <p id="message-count" className="text-right text-xs text-muted-foreground">
                  {messageBytes}/{MAX_MESSAGE_SIZE}
                </p>
                {form.formState.errors.message && (
                  <p id="message-error" className="text-sm text-wallet-outgoing">
                    {form.formState.errors.message.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3 text-sm">
                <span className="text-muted-foreground">{t("send.estimatedFees")}</span>
                <span className="font-mono">
                  <CcxAmount>{formatCcx(SEND_FEE, 6)}</CcxAmount>
                </span>
              </div>

              <Button
                type="submit"
                className="w-full active:scale-[0.98] motion-reduce:active:scale-100"
                disabled={
                  send.isPending ||
                  sendToSelf ||
                  isSyncing ||
                  viewOnly ||
                  // Block before the review step when amount + fee overshoots the
                  // balance, instead of letting it submit and fail at broadcast.
                  (amount > 0 && amount + SEND_FEE > available)
                }
                title={viewOnly ? walletCopy.viewOnlySendDisabled : undefined}
              >
                {t("send.reviewButton")}
              </Button>
              {viewOnly ? (
                <p className="text-center text-xs text-wallet-amber">
                  {walletCopy.viewOnlySendDisabled}
                </p>
              ) : null}
            </form>
          </SectionCard>
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
              {t("action.cancel")}
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
            <DialogTitle>{t("send.confirmTitle")}</DialogTitle>
            <DialogDescription>{walletCopy.sendConfirm}</DialogDescription>
          </DialogHeader>
          {sendWarnings.length > 0 ? <SendReviewWarnings warnings={sendWarnings} /> : null}
          {review ? (
            <div className="space-y-3 text-sm">
              <Row label={t("rail.to")} value={truncateAddress(review.address, 10, 8)} mono />
              <Row
                label={t("rail.amount")}
                value={formatCcx(review.amount, CCX_PRECISION_DECIMAL_DISPLAY)}
                mono
              />
              <Row label={t("send.networkFee")} value={formatCcx(NETWORK_FEE, 6)} mono />
              <Row label={t("send.remoteNodeFee")} value={formatCcx(REMOTE_NODE_FEE, 6)} mono />
              <div className="my-1 border-t border-border" />
              <Row
                label={t("send.total")}
                value={formatCcx(review.amount + SEND_FEE, 6)}
                mono
                strong
              />
              <Row
                label={t("send.approxUsdLabel")}
                value={formatUsd((review.amount + SEND_FEE) * price)}
              />
              {review.paymentId ? (
                <Row
                  label={t("rail.paymentId")}
                  value={truncateAddress(review.paymentId, 8, 6)}
                  mono
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              {t("action.cancel")}
            </Button>
            <Button type="button" onClick={confirmSend} disabled={send.isPending}>
              {send.isPending ? t("send.sending") : t("send.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Small-screen fallback: the rail column is hidden < 1200px, so surface
          the balance + market summary inline. CSS-hidden above the breakpoint. */}
      <div className="mt-8 min-[1200px]:hidden">
        <SendRail embedded />
      </div>
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

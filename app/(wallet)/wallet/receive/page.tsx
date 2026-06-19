"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CcxAmount } from "@/components/wallet/ccx";
import {
  CopyButton,
  PageHeader,
  SectionCard,
  ViewOnlyBadge,
  WalletQrCode,
} from "@/components/wallet/common";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import { useDeposits, useTransactions, useWalletInfo, useWalletViewOnly } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { CoinUri } from "@/lib/ui/coin-uri";
import { buildPaymentSendUrl } from "@/lib/ui/payment-link";
import { downloadQrPng, qrPngFilename, qrToPngBlob } from "@/lib/ui/qr-png";
import { cn, formatCcx, timeAgo, truncateAddress, withBasePath } from "@/lib/utils";

const QR_LOGOS = [
  { id: "orange", src: "/brand/conceal-mark-orange.svg" },
  { id: "steel", src: "/brand/conceal-mark.svg" },
  { id: "coin", src: "/brand/conceal-logo.svg" },
] as const;

const QR_LOGO_LABEL_KEYS: Record<(typeof QR_LOGOS)[number]["id"], string> = {
  orange: "receive.qrLogoOrange",
  steel: "receive.qrLogoSteel",
  coin: "receive.qrLogoCoin",
};

export default function ReceivePage() {
  const { t } = useI18n();
  const wallet = useWalletInfo();
  const viewOnly = useWalletViewOnly();
  const transactions = useTransactions();
  const deposits = useDeposits();
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [message, setMessage] = useState("");
  const [v1Qr, setV1Qr] = useState(false);
  const [qrLogo, setQrLogo] = useState<(typeof QR_LOGOS)[number]["src"]>(QR_LOGOS[0].src);

  const address = wallet.data?.address ?? "";
  const amountNum = Number.parseFloat(amount);
  const hasPaymentLink = Number.isFinite(amountNum) && amountNum > 0;
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
  const paymentPageUrl = useMemo(() => {
    if (!hasPaymentLink || !address) return "";
    return buildPaymentSendUrl({
      address,
      amount,
      paymentId,
      message,
      v1: v1Qr,
    });
  }, [address, amount, hasPaymentLink, message, paymentId, v1Qr]);
  const qrDescription = v1Qr
    ? hasRequest
      ? amount
        ? t("receive.qrV1RequestAmount", { amount })
        : t("receive.qrV1Request")
      : t("receive.qrV1Address")
    : hasRequest
      ? amount
        ? t("receive.qrRequestAmount", { amount })
        : t("receive.qrRequest")
      : t("receive.qrAddress");
  const received = (transactions.data ?? [])
    .filter((transaction) => transaction.type === "receive")
    .slice(0, 5);
  const depositHistory = (deposits.data ?? []).slice(0, 5);

  async function handleDownloadQrPng() {
    if (!paymentUri) return;
    try {
      const blob = await qrToPngBlob(paymentUri);
      downloadQrPng(qrPngFilename(address.slice(0, 12)), blob);
      toast.success(t("receive.qrSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("receive.qrSaveError"));
    }
  }

  return (
    <>
      <PageHeader
        title={t("receive.title")}
        subtitle={t("receive.subtitle")}
        badge={viewOnly ? <ViewOnlyBadge /> : null}
      />
      <WalletSyncingBanner />
      <ViewOnlyBanner />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
            <SectionCard
              title={t("receive.addressCardTitle")}
              description={t("receive.addressCardDescription")}
            >
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-4">
                  <p className="break-all rounded-xl bg-secondary p-4 font-mono text-sm text-foreground">
                    {address}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <CopyButton value={address} label={t("receive.copyAddress")} />
                    <div className="flex items-center gap-2">
                      <Switch
                        id="v1-qr"
                        checked={v1Qr}
                        onCheckedChange={setV1Qr}
                        aria-label={t("receive.v1Label")}
                      />
                      <Label htmlFor="v1-qr" className="cursor-pointer text-sm font-normal">
                        {t("receive.v1Label")}
                      </Label>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{qrDescription}</p>
                </div>
                <div className="mx-auto flex shrink-0 flex-col items-center gap-3">
                  <div className="rounded-2xl bg-white p-4">
                    <WalletQrCode value={paymentUri} size={180} logoSrc={qrLogo} />
                  </div>
                  <div className="flex items-center gap-2">
                    {QR_LOGOS.map((logo) => (
                      <button
                        key={logo.id}
                        type="button"
                        aria-pressed={qrLogo === logo.src}
                        aria-label={t(QR_LOGO_LABEL_KEYS[logo.id])}
                        onClick={() => setQrLogo(logo.src)}
                        className={cn(
                          "grid size-10 cursor-pointer place-items-center rounded-xl border border-border bg-secondary transition-colors duration-200 hover:border-ring focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                          qrLogo === logo.src && "border-primary ring-1 ring-primary",
                        )}
                      >
                        <img
                          src={withBasePath(logo.src)}
                          alt=""
                          className="size-6 object-contain"
                        />
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={!paymentUri}
                    onClick={handleDownloadQrPng}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t("receive.downloadPng")}
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard
              title={t("receive.requestTitle")}
              description={t("receive.requestDescription")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="req-amount">{t("receive.amountLabel")}</Label>
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
                  <Label htmlFor="req-paymentId">{t("rail.paymentId")}</Label>
                  <Input
                    id="req-paymentId"
                    value={paymentId}
                    onChange={(event) => setPaymentId(event.target.value)}
                    placeholder={t("receive.optional")}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="req-message">{t("rail.message")}</Label>
                  <Textarea
                    id="req-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={t("receive.messagePlaceholder")}
                  />
                </div>
              </div>
              {hasPaymentLink ? (
                <div className="mt-4 space-y-3 rounded-xl bg-secondary p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("receive.paymentLink")}
                  </p>
                  <p className="break-all font-mono text-sm text-foreground">{paymentPageUrl}</p>
                  <CopyButton value={paymentPageUrl} label={t("receive.copyPaymentLink")} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("receive.enterAmountHint")}
                </p>
              )}
            </SectionCard>
          </div>
        </div>

        <div className="space-y-6">
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:140ms]">
            <SectionCard
              title={t("receive.recentlyReceived")}
              description={t("receive.last5Incoming")}
              footer={
                <Link
                  className="inline-flex cursor-pointer rounded-sm text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  href="/wallet/transactions"
                >
                  {t("receive.viewAllTransactions")}
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
                <p className="text-sm text-muted-foreground">{t("receive.noIncoming")}</p>
              )}
            </SectionCard>
          </div>

          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:210ms]">
            <SectionCard title={t("receive.depositHistory")} description={t("receive.last5Deposits")}>
              {depositHistory.length > 0 ? (
                <ul className="divide-y divide-border">
                  {depositHistory.map((deposit) => (
                    <li
                      key={deposit.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <span className="text-sm text-muted-foreground">
                        {t("receive.durationMonths", { count: deposit.durationMonths })}
                      </span>
                      <span className="font-mono text-sm font-semibold text-wallet-deposit">
                        +<CcxAmount>{formatCcx(deposit.amount)}</CcxAmount>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("receive.noDeposits")}</p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}

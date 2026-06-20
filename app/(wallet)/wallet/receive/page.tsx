"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ReceiveRail } from "@/components/layout/rails/receive-rail";
import { usePageRightRail } from "@/components/layout/right-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CopyButton,
  PageHeader,
  SectionCard,
  ViewOnlyBadge,
  WalletQrCode,
} from "@/components/wallet/common";
import { SharePaymentCard } from "@/components/wallet/share-payment-card";
import { WalletSyncingBanner } from "@/components/wallet/syncing-banner";
import { ViewOnlyBanner } from "@/components/wallet/view-only-banner";
import { MAX_MESSAGE_SIZE } from "@/lib/config/config";
import { useWalletInfo, useWalletViewOnly } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { CoinUri } from "@/lib/ui/coin-uri";
import { buildPaymentSendUrl } from "@/lib/ui/payment-link";
import { downloadQrPng, qrPngFilename, qrToPngBlob } from "@/lib/ui/qr-png";
import { cn, withBasePath } from "@/lib/utils";
import { paymentIdIsValid } from "@/lib/validation/ccx";

const QR_LOGOS = [
  { id: "orange", src: "/brand/conceal-mark-orange.svg" },
  { id: "steel", src: "/brand/conceal-mark.svg" },
  { id: "coin", src: "/brand/conceal-logo.svg" },
  { id: "ink", src: "/brand/conceal-mark-ink.svg" },
] as const;

const QR_LOGO_LABEL_KEYS: Record<(typeof QR_LOGOS)[number]["id"], string> = {
  orange: "receive.qrLogoOrange",
  steel: "receive.qrLogoSteel",
  coin: "receive.qrLogoCoin",
  ink: "receive.qrLogoInk",
};

export default function ReceivePage() {
  const { t } = useI18n();
  usePageRightRail(<ReceiveRail />);
  const wallet = useWalletInfo();
  const viewOnly = useWalletViewOnly();
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [v1Link, setV1Link] = useState(false);
  const [qrLogo, setQrLogo] = useState<(typeof QR_LOGOS)[number]["src"]>(QR_LOGOS[0].src);

  const address = wallet.data?.address ?? "";
  const amountTrimmed = amount.trim();
  // Strict positive decimal, ≤6dp. `parseFloat` would accept "1e3"/"1." and the
  // raw string then gets encoded into the QR/link — but the QR parser reads "1e3"
  // as 1 and the payment-link parser rejects it. Validate before encoding.
  const amountValid = /^\d{1,12}(\.\d{1,6})?$/.test(amountTrimmed) && Number(amountTrimmed) > 0;
  const amountForUri = amountValid ? amountTrimmed : null;
  const hasPaymentLink = amountValid;
  const hasRequest = Boolean(amountTrimmed || paymentId || message || recipientName);
  // Light field validation: invalid payment-ID / over-size message are excluded
  // from the encoded QR + link (so they stay scannable/valid) and flagged inline.
  const paymentIdValid = paymentIdIsValid(paymentId);
  const messageBytes = new TextEncoder().encode(message).length;
  const messageTooLong = messageBytes > MAX_MESSAGE_SIZE;
  const paymentUri = useMemo(() => {
    if (!address) return "";
    // CoinUri.encodeTx emits a bare address (no `conceal:` prefix) regardless of
    // version — upstream dropped the prefix to fix QR scanning — so the QR itself
    // does not vary with `v1Link`. v1 only changes the shareable payment LINK below.
    return CoinUri.encodeTx(
      address,
      paymentIdValid ? paymentId || null : null,
      amountForUri,
      recipientName || null,
      messageTooLong ? null : message || null,
    );
  }, [address, amountForUri, message, messageTooLong, paymentId, paymentIdValid, recipientName]);
  const paymentPageUrl = useMemo(() => {
    if (!hasPaymentLink || !address) return "";
    return buildPaymentSendUrl({
      address,
      amount: amountForUri ?? "",
      paymentId: paymentIdValid ? paymentId : "",
      message: messageTooLong ? "" : message,
      label: recipientName,
      v1: v1Link,
    });
  }, [
    address,
    amountForUri,
    hasPaymentLink,
    message,
    messageTooLong,
    paymentId,
    paymentIdValid,
    recipientName,
    v1Link,
  ]);
  const qrDescription = hasRequest
    ? amountForUri
      ? t("receive.qrRequestAmount", { amount: amountForUri })
      : t("receive.qrRequest")
    : t("receive.qrAddress");

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
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
          <SectionCard
            title={t("receive.addressCardTitle")}
            description={t("receive.addressCardDescription")}
            headerAction={<CopyButton value={address} label={t("receive.copyAddress")} />}
          >
            {/* Merged interactive card (Gemini Variant A): the address reads first
                at full width; below it the QR + logo picker + Download sit on the
                left and the Request-a-Payment form fills the right — no dead space.
                The QR + payment link regenerate live as the amount/note change. */}
            <div className="flex flex-col gap-5">
              <p className="break-all rounded-xl border border-border bg-secondary p-4 font-mono text-sm text-foreground">
                {address}
              </p>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-3 sm:w-48">
                  <WalletQrCode value={paymentUri} size={150} logoSrc={qrLogo} />
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
                  <SharePaymentCard
                    qrValue={paymentUri}
                    address={address}
                    amountLabel={amountForUri ? `${amountForUri} CCX` : null}
                    disabled={!paymentUri}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled={!paymentUri}
                    onClick={handleDownloadQrPng}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t("receive.downloadPng")}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{qrDescription}</p>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <div>
                    <h3 className="font-heading text-base font-medium leading-snug text-foreground">
                      {t("receive.requestTitle")}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("receive.requestDescription")}
                    </p>
                  </div>
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
                        aria-invalid={amountTrimmed !== "" && !amountValid ? true : undefined}
                      />
                      {amountTrimmed !== "" && !amountValid ? (
                        <p className="text-sm text-wallet-outgoing">
                          {t("receive.errAmountInvalid")}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="req-paymentId">{t("rail.paymentId")}</Label>
                      <Input
                        id="req-paymentId"
                        value={paymentId}
                        onChange={(event) => setPaymentId(event.target.value)}
                        placeholder={t("receive.optional")}
                        autoComplete="off"
                        aria-invalid={paymentId !== "" && !paymentIdValid ? true : undefined}
                      />
                      {paymentId !== "" && !paymentIdValid ? (
                        <p className="text-sm text-wallet-outgoing">
                          {t("addressBook.errPaymentIdInvalid")}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="req-recipient">{t("receive.recipientLabel")}</Label>
                      <Input
                        id="req-recipient"
                        value={recipientName}
                        onChange={(event) => setRecipientName(event.target.value)}
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
                        aria-invalid={messageTooLong ? true : undefined}
                      />
                      <p
                        className={cn(
                          "text-right text-xs",
                          messageTooLong ? "text-wallet-outgoing" : "text-muted-foreground",
                        )}
                      >
                        {messageBytes}/{MAX_MESSAGE_SIZE}
                      </p>
                    </div>
                  </div>
                  {hasPaymentLink ? null : (
                    <p className="text-sm text-muted-foreground">{t("receive.enterAmountHint")}</p>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* The generated payment link lives in its own card below — it only
            exists once an amount is set, so it stays out of the build-the-request
            card above. v1 toggles the legacy `/#!send` link format (QR is unaffected). */}
        {hasPaymentLink ? (
          <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
            <SectionCard title={t("receive.paymentLink")}>
              <div className="space-y-3">
                <p className="break-all rounded-xl border border-border bg-secondary p-4 font-mono text-sm text-foreground">
                  {paymentPageUrl}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CopyButton value={paymentPageUrl} label={t("receive.copyPaymentLink")} />
                  <div className="flex items-center gap-2">
                    <Switch
                      id="v1-link"
                      checked={v1Link}
                      onCheckedChange={setV1Link}
                      aria-label={t("receive.v1Label")}
                    />
                    <Label htmlFor="v1-link" className="cursor-pointer text-sm font-normal">
                      {t("receive.v1Label")}
                    </Label>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </div>
      {/* Small-screen fallback: rail column hidden < 1200px → surface recent
          incoming + market inline. CSS-hidden above the breakpoint. */}
      <div className="mt-8 min-[1200px]:hidden">
        <ReceiveRail embedded />
      </div>
    </>
  );
}

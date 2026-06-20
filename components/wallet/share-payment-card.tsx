"use client";

import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { paymentCardFilename, paymentCardToPngBlob } from "@/lib/ui/payment-card-png";
import { downloadQrPng } from "@/lib/ui/qr-png";

// "Share payment request" — opens a branded card (QR + amount + address + mark)
// rendered to a PNG. Doubles as a Present view (the modal shows the card large
// for in-person scanning); Share fires the native share-sheet (image when the
// browser supports file sharing, else the page), Save downloads the PNG.
export function SharePaymentCard({
  qrValue,
  address,
  amountLabel,
  disabled,
}: {
  qrValue: string;
  address: string;
  /** Pre-formatted amount line (e.g. "5 CCX"), or null for "any amount". */
  amountLabel?: string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Render the card whenever the dialog is open and its inputs change.
  useEffect(() => {
    if (!open || !qrValue) return;
    let url: string | null = null;
    let cancelled = false;
    setError(false);
    setImgUrl(null);
    setBlob(null);
    paymentCardToPngBlob({
      qrValue,
      address,
      amountLabel,
      labels: {
        title: t("receive.shareDialogTitle"),
        anyAmount: t("receive.shareCardAnyAmount"),
        footer: t("receive.shareCardFooter"),
      },
    })
      .then((result) => {
        if (cancelled) return;
        url = URL.createObjectURL(result);
        setBlob(result);
        setImgUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, qrValue, address, amountLabel, t]);

  function handleSave() {
    if (!blob) return;
    downloadQrPng(paymentCardFilename(address.slice(0, 12)), blob);
  }

  async function handleShare() {
    if (!blob) return;
    const file = new File([blob], paymentCardFilename(address.slice(0, 12)), { type: "image/png" });
    const text = amountLabel
      ? t("receive.shareText", { amount: amountLabel })
      : t("receive.shareTextNoAmount");
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t("receive.shareDialogTitle"), text });
      } else {
        await navigator.share({ title: t("receive.shareDialogTitle"), text });
      }
    } catch (shareError) {
      // User-cancelled share rejects with AbortError — not an error to surface.
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      toast.error(t("receive.shareError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full gap-2" disabled={disabled}>
          <Share2 className="size-4" aria-hidden="true" />
          {t("receive.shareButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("receive.shareDialogTitle")}</DialogTitle>
          <DialogDescription>{t("receive.shareDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          {error ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("receive.shareError")}
            </p>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt={t("receive.shareImageAlt")}
              className="max-h-[55vh] w-auto rounded-2xl"
            />
          ) : (
            <Skeleton className="aspect-[680/940] w-[260px] rounded-2xl" />
          )}
        </div>

        <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
          {canShare ? (
            <Button type="button" className="w-full gap-2" disabled={!blob} onClick={handleShare}>
              <Share2 className="size-4" aria-hidden="true" />
              {t("receive.shareButton")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={!blob}
            onClick={handleSave}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("receive.saveImage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

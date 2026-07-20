"use client";

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { Camera } from "lucide-react";
import { useState } from "react";
import { QrCameraScanner } from "@/components/qr/qr-camera-scanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { parseScannedPaymentId } from "@/lib/ui/parse-scanned-send-payload";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

/** Camera trigger for payment-ID fields — visible on small screens only (lg:hidden). */
export function PaymentIdQrScanButton({
  onScan,
  className,
  disabled,
}: {
  onScan: (paymentId: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  function handleDecode(payload: string) {
    const pid = parseScannedPaymentId(payload);
    if (!pid) {
      toast.error(t("toast.qrUnreadable"));
      return;
    }
    onScan(pid);
    setOpen(false);
    toast.success(t("toast.qrScanned"));
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn("text-muted-foreground hover:text-foreground", className)}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={t("qr.scanPaymentIdAria")}
      >
        <Camera className="size-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("qr.scanTitle")}</DialogTitle>
            <DialogDescription>{t("qr.scanPaymentIdDescription")}</DialogDescription>
          </DialogHeader>
          <QrCameraScanner onDecode={handleDecode} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

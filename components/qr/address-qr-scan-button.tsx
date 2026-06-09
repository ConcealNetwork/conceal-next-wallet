"use client";

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QrCameraScanner } from "@/components/qr/qr-camera-scanner";
import {
  parseScannedSendPayload,
  type ScannedSendDraft,
} from "@/lib/ui/parse-scanned-send-payload";
import { cn } from "@/lib/utils";

/** Camera trigger for address fields — visible on small screens only (sm:hidden). */
export function AddressQrScanButton({
  onScan,
  className,
  disabled,
}: {
  onScan: (draft: ScannedSendDraft) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function handleDecode(payload: string) {
    const draft = parseScannedSendPayload(payload);
    if (!draft?.address.trim()) {
      toast.error("Could not read that QR code.");
      return;
    }
    onScan(draft);
    setOpen(false);
    toast.success("QR code scanned.");
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
        aria-label="Scan address QR code"
      >
        <Camera className="size-4" aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan QR code</DialogTitle>
            <DialogDescription>
              Point your camera at a CCX address or payment request QR.
            </DialogDescription>
          </DialogHeader>
          <QrCameraScanner onDecode={handleDecode} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

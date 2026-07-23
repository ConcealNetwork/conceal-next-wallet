"use client";

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ensureCameraPermissionForCordova } from "@/lib/cordova/camera-permission";

async function openCameraStream(): Promise<MediaStream> {
  // Prefer rear camera, but some devices/WebViews reject facingMode constraints.
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true });
  }
}

/**
 * Live camera QR scanner. Streams the rear camera, decodes frames with jsQR, and
 * calls `onDecode` with the first payload found. The MediaStream is always
 * stopped on unmount (camera light off) — and on a successful decode the parent
 * is expected to unmount this, which triggers that cleanup.
 *
 * Additive: callers keep image-upload / paste as fallbacks, so a denied or
 * missing camera never blocks the flow.
 */
export function QrCameraScanner({
  onDecode,
  onCancel,
}: {
  onDecode: (payload: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't access the camera. Upload a QR image instead.");
        return;
      }
      try {
        const allowed = await ensureCameraPermissionForCordova();
        if (cancelled) return;
        if (!allowed) {
          setError(
            "Camera permission was denied. Allow camera access in app settings, force-stop and reopen the app, or upload a QR image instead.",
          );
          return;
        }

        stream = await openCameraStream();
        const video = videoRef.current;
        if (cancelled || !video) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        if (cancelled) return;

        const { decodeQrFromImageData } = await import("@/lib/ui/qr-decode");
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tick = () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (ctx && v && v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const payload = decodeQrFromImageData(frame.data, frame.width, frame.height);
            if (payload) {
              onDecodeRef.current(payload);
              return; // stop scanning; parent unmounts us -> cleanup stops the camera
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        // If the stream came up before a later step threw, stop it now rather
        // than leaving the camera on behind an error until unmount.
        stream?.getTracks().forEach((track) => {
          track.stop();
        });
        if (!cancelled) {
          const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
          setError(
            `Couldn't access the camera${detail}. If you just allowed Camera in settings, force-stop and reopen the app, then try again — or upload an image instead.`,
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-wallet-outgoing" role="alert">
          {error}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
            autoPlay
          />
        </div>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

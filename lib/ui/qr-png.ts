import qrcode from "qrcode-generator";
import { triggerBlobDownload } from "@/lib/ui/download-blob";

// Match the on-screen QR (components/qr/dotted-qr.tsx): dark ink + white field,
// error-correction level H.
const QR_DARK = "#171513";
const QR_LIGHT = "#ffffff";
/** Quiet-zone border in modules (ISO/IEC 18004 requires ≥4). */
export const QR_PNG_QUIET_ZONE = 4;
/** Device pixels per QR module — sets the exported resolution. */
export const QR_PNG_MODULE_SCALE = 10;

/**
 * Build the QR module matrix (`true` = dark) for a value at error-correction
 * level H. Pure — no DOM — so it is unit-testable; the canvas rasterization is a
 * thin separate step.
 */
export function qrModuleMatrix(value: string, ecLevel: "L" | "M" | "Q" | "H" = "H"): boolean[][] {
  const qr = qrcode(0, ecLevel);
  qr.addData(value, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
  );
}

export interface QrPngOptions {
  scale?: number;
  quietZone?: number;
  /** Error-correction level. Defaults to H; lower (e.g. M) fits more data per QR. */
  ecLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Rasterize a value to a plain square-module QR PNG (no logo — maximizes
 * scannability) and resolve a PNG Blob. Browser-only. Drawing the modules
 * directly avoids serializing/rasterizing an SVG (which would taint the canvas
 * via the external logo `<image>` and break `toBlob`).
 */
export function qrToPngBlob(value: string, options: QrPngOptions = {}): Promise<Blob> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("QR export is only available in the browser."));
  }
  if (!value) {
    return Promise.reject(new Error("Nothing to encode."));
  }

  const scale = options.scale ?? QR_PNG_MODULE_SCALE;
  const quietZone = options.quietZone ?? QR_PNG_QUIET_ZONE;
  let matrix: boolean[][];
  try {
    // qrcode-generator throws if the value exceeds level-H capacity — keep the
    // promise contract instead of throwing synchronously.
    matrix = qrModuleMatrix(value);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Failed to encode QR code."));
  }
  const count = matrix.length;
  const dimension = (count + quietZone * 2) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas 2D context is unavailable."));
  }

  ctx.fillStyle = QR_LIGHT;
  ctx.fillRect(0, 0, dimension, dimension);
  ctx.fillStyle = QR_DARK;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (matrix[row][col]) {
        ctx.fillRect((col + quietZone) * scale, (row + quietZone) * scale, scale, scale);
      }
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      // Release the (potentially large) backing store promptly rather than
      // waiting for GC.
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("Failed to render QR PNG."));
    }, "image/png");
  });
}

/**
 * Rasterize a value to a PNG data URL (square modules, no logo) — for embedding a
 * QR into a generated PDF. Synchronous + browser-only.
 */
export function qrToDataUrl(value: string, options: QrPngOptions = {}): string {
  if (typeof document === "undefined") {
    throw new Error("QR rendering is only available in the browser.");
  }
  const scale = options.scale ?? QR_PNG_MODULE_SCALE;
  const quietZone = options.quietZone ?? QR_PNG_QUIET_ZONE;
  const matrix = qrModuleMatrix(value, options.ecLevel);
  const count = matrix.length;
  const dimension = (count + quietZone * 2) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  ctx.fillStyle = QR_LIGHT;
  ctx.fillRect(0, 0, dimension, dimension);
  ctx.fillStyle = QR_DARK;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (matrix[row][col]) {
        ctx.fillRect((col + quietZone) * scale, (row + quietZone) * scale, scale, scale);
      }
    }
  }
  const url = canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/**
 * Build a `<prefix>-<label>.png` filename, sanitizing the label to `[a-z0-9-]` and capping it at
 * 16 chars. Shared by the QR + payment-card PNG exporters (payment-card-png.ts imports this).
 */
export function sanitizePngLabel(label: string, prefix: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16)
    .replace(/-+$/, ""); // the slice can re-expose a trailing dash
  return `${prefix}${cleaned ? `-${cleaned}` : ""}.png`;
}

/** Filename like `conceal-qr-ccx7abcd.png`, sanitized to `[a-z0-9-]`. */
export function qrPngFilename(label: string): string {
  return sanitizePngLabel(label, "conceal-qr");
}

/** Trigger a browser download of a PNG Blob (same anchor pattern as the CSV/JSON exports). */
export function downloadQrPng(filename: string, blob: Blob): void {
  const name = filename.endsWith(".png") ? filename : `${filename}.png`;
  triggerBlobDownload(name, blob);
}

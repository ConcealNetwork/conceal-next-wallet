import { qrModuleMatrix, sanitizePngLabel } from "./qr-png";

// Renders a branded, shareable "payment request" card to a PNG — the richer
// counterpart to qr-png.ts (which exports the bare QR). Drawn entirely with
// canvas primitives + QR modules (no external <image>), so toBlob never taints.
// Brand chrome stays English (it's a graphic artifact); the caller passes
// localized field labels.

export interface PaymentCardOptions {
  /** The value encoded in the QR (the conceal payment URI). */
  qrValue: string;
  /** Wallet address, shown truncated under the QR. */
  address: string;
  /** Pre-formatted amount line (e.g. "5 CCX"); null → "any amount" row. */
  amountLabel?: string | null;
  /** Localized strings for the card body. */
  labels: {
    /** Small label above the amount, e.g. "Payment request". */
    title: string;
    /** Shown when no amount is set, e.g. "Send any amount". */
    anyAmount: string;
    /** Footer hint, e.g. "Scan with a Conceal wallet". */
    footer: string;
  };
}

// Warm dark card — premium, and stands out on any chat background.
const C = {
  card: "#1c1916",
  ink: "#ffffff",
  muted: "#a9a097",
  accent: "#FFA500",
  tile: "#ffffff",
  module: "#18120d",
};

const SCALE = 2; // export at 2× for crisp output
const W = 680;
const H = 940;
const PAD = 52;
const RADIUS = 28;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncateAddressFor(address: string): string {
  if (address.length <= 24) return address;
  return `${address.slice(0, 14)}…${address.slice(-8)}`;
}

/**
 * Render the payment-request card to a PNG Blob. Browser-only.
 */
export function paymentCardToPngBlob(options: PaymentCardOptions): Promise<Blob> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Card export is only available in the browser."));
  }
  const { qrValue, address, amountLabel, labels } = options;
  if (!qrValue) return Promise.reject(new Error("Nothing to encode."));

  let matrix: boolean[][];
  try {
    matrix = qrModuleMatrix(qrValue);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Failed to encode QR code."));
  }

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D context is unavailable."));
  ctx.scale(SCALE, SCALE);
  ctx.textAlign = "center";

  // Card body (rounded; transparent corners).
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.fillStyle = C.card;
  ctx.fill();

  const cx = W / 2;
  let y = PAD + 24;

  // Brand wordmark.
  ctx.fillStyle = C.accent;
  ctx.font = "700 26px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("C O N C E A L", cx, y);
  y += 44;

  // Title label.
  ctx.fillStyle = C.muted;
  ctx.font = "500 19px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(labels.title, cx, y);
  y += 52;

  // Amount.
  if (amountLabel) {
    ctx.fillStyle = C.ink;
    ctx.font = "700 52px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(amountLabel, cx, y);
  } else {
    ctx.fillStyle = C.muted;
    ctx.font = "500 30px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(labels.anyAmount, cx, y);
  }
  y += 40;

  // QR tile.
  const count = matrix.length;
  const quiet = 2;
  const targetQr = 380;
  const moduleSize = Math.max(1, Math.floor(targetQr / (count + quiet * 2)));
  const qrPx = (count + quiet * 2) * moduleSize;
  const tilePad = 22;
  const tileSize = qrPx + tilePad * 2;
  const tileX = cx - tileSize / 2;
  const tileY = y;
  roundRect(ctx, tileX, tileY, tileSize, tileSize, 20);
  ctx.fillStyle = C.tile;
  ctx.fill();
  ctx.fillStyle = C.module;
  const originX = tileX + tilePad + quiet * moduleSize;
  const originY = tileY + tilePad + quiet * moduleSize;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (matrix[row][col]) {
        ctx.fillRect(
          originX + col * moduleSize,
          originY + row * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }
  y = tileY + tileSize + 44;

  // Address (truncated, mono).
  ctx.fillStyle = C.ink;
  ctx.font = "500 20px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
  ctx.fillText(truncateAddressFor(address), cx, y);
  y += 40;

  // Footer.
  ctx.fillStyle = C.muted;
  ctx.font = "400 16px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(labels.footer, cx, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("Failed to render the payment card."));
    }, "image/png");
  });
}

/** Filename like `conceal-request-ccx7abcd.png`. */
export function paymentCardFilename(label: string): string {
  return sanitizePngLabel(label, "conceal-request");
}

import jsQR from "jsqr";

/** Decode a QR code from raw RGBA pixel data. Returns the payload, or null if none found. */
export function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return result?.data ?? null;
}

/**
 * Decode a QR code from an image file (browser only — rasterises via canvas).
 * The image is processed entirely in-memory; nothing is uploaded.
 * Returns the decoded payload, or null if no QR code is found.
 */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeQrFromImageData(imageData.data, imageData.width, imageData.height);
  } finally {
    bitmap.close?.();
  }
}

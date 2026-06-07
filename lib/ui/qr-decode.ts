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
/** Cap the working resolution: a QR needs only a few hundred px to decode, but a
 *  phone photo can be many megapixels — rasterising at native size would allocate
 *  tens of MB of RGBA on the main thread. */
const QR_MAX_DIMENSION = 1600;

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, QR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return decodeQrFromImageData(imageData.data, imageData.width, imageData.height);
  } finally {
    bitmap.close?.();
  }
}

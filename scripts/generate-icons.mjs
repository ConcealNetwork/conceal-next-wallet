// Regenerate PWA / app icons from the Conceal mark.
//   node scripts/generate-icons.mjs
// Outputs: public/icon-192.png, public/icon-512.png,
//          public/icon-maskable-512.png, app/apple-icon.png
import { readFileSync } from "node:fs";
import sharp from "sharp";

const MARK = readFileSync("public/brand/conceal-mark-orange.svg");
const BG = { r: 26, g: 22, b: 19, alpha: 1 }; // #1a1613 — brand surface

async function makeIcon(size, markFraction, out) {
  const markSize = Math.round(size * markFraction);
  const mark = await sharp(MARK, { density: 384 })
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((size - markSize) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, top: offset, left: offset }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

// Non-maskable (mark fills more); maskable keeps content in the inner safe zone.
await makeIcon(192, 0.68, "public/icon-192.png");
await makeIcon(512, 0.68, "public/icon-512.png");
await makeIcon(512, 0.6, "public/icon-maskable-512.png");
await makeIcon(180, 0.7, "app/apple-icon.png");

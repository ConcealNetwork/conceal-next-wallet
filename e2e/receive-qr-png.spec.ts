import { expect, test } from "@playwright/test";

test("downloads the receive QR as a PNG", async ({ page }) => {
  await page.goto("/");
  // Wait for the landing to hydrate so "Open your wallet" targets the wallet
  // (not the onboarding /create route it links to pre-hydration).
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^conceal-qr.*\.png$/);

  // Non-empty PNG (magic bytes \x89PNG).
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buf = Buffer.concat(chunks);
  expect(buf.length).toBeGreaterThan(100);
  expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function openWallet(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();
  const account = page.getByRole("heading", { name: "Account Overview" });
  await expect(async () => {
    if (!(await account.isVisible())) {
      await page.getByRole("button", { name: "Open your wallet" }).click({ timeout: 2000 });
    }
    await expect(account).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

test("exports an encrypted device-data backup and restores it", async ({ page }) => {
  await openWallet(page);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Device data backup")).toBeVisible();

  // Export → fill password → download.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export device data" })).toBeVisible();
  await page.getByLabel("Backup password", { exact: true }).fill("hunter2hunter2");
  await page.getByLabel("Confirm password").fill("hunter2hunter2");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  // The file must be encrypted — no plaintext prefs leaking.
  const contents = readFileSync(path as string, "utf8");
  expect(contents).toContain("local-data-vault");
  expect(contents).toContain("PBKDF2");
  expect(contents).not.toContain("ccx-theme");

  // Restore the same file (set it on the hidden file input directly).
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(path as string);
  await expect(page.getByRole("heading", { name: "Restore device data" })).toBeVisible();
  await page.getByLabel("Backup password", { exact: true }).fill("hunter2hunter2");
  await page.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(page.getByText(/Restored .* preference/i)).toBeVisible();

  // Wrong password is rejected.
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(path as string);
  await expect(page.getByRole("heading", { name: "Restore device data" })).toBeVisible();
  await page.getByLabel("Backup password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText(/wrong password|corrupt/i)).toBeVisible();
});

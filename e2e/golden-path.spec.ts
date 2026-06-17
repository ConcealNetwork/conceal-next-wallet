import { expect, test } from "@playwright/test";
import { MOCK_ADDRESS } from "../lib/mock-data/wallet";

test("open wallet, view account, receive, and disconnect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();

  // Mock mode opens the wallet directly (no password dialog).
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();
  await expect(page.getByText(/1,250\.50/).first()).toBeVisible();

  // Receive page shows the address + a QR. Retry the nav click: the sidebar link
  // is a no-op until it hydrates, which can lag on a cold CI runner.
  const receiveHeading = page.getByRole("heading", { name: "Receive CCX" });
  await expect(async () => {
    if (!(await receiveHeading.isVisible())) {
      await page.getByRole("link", { name: "Receive", exact: true }).click({ timeout: 2000 });
    }
    await expect(receiveHeading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText(MOCK_ADDRESS).first()).toBeVisible();

  // Disconnect (confirm dialog) returns to the landing page.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();
});

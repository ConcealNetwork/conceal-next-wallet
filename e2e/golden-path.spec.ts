import { expect, test } from "@playwright/test";

// Mock wallet address from lib/mock-data.
const MOCK_ADDRESS =
  "ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m";

test("open wallet, view account, receive, and disconnect", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();

  // Mock mode opens the wallet directly (no password dialog).
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();
  await expect(page.getByText(/1,250\.50/).first()).toBeVisible();

  // Receive page shows the address + a QR.
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible();
  await expect(page.getByText(MOCK_ADDRESS).first()).toBeVisible();

  // Disconnect (confirm dialog) returns to the landing page.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();
});

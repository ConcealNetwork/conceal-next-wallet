import { expect, test } from "@playwright/test";
import { MOCK_ADDRESS } from "../lib/mock-data/wallet";

test("import a view-only wallet and verify spend actions are disabled", async ({ page }) => {
  await page.goto("/import/keys");

  // Step 1 — choose "View-only".
  await page.getByRole("button", { name: /View-only/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — address + private view key (mock relaxes `required`, but shapes must be valid).
  await page.locator("#import-keys-address").fill(MOCK_ADDRESS);
  await page.locator("#import-keys-view").fill("a".repeat(64));
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — scan height (default is fine).
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4 — device password.
  // Must satisfy the min password-strength gate (length>=8 && >=3 strength hints).
  await page.locator("#import-keys-password").fill("Password123!");
  await page.locator("#import-keys-confirm").fill("Password123!");
  await page.getByRole("button", { name: "Open Mock Wallet" }).click();

  // Lands on the account with the view-only badge + banner.
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();
  await expect(page.getByTestId("view-only-banner")).toBeVisible();

  // Send — banner visible, Review Send disabled, but the address/QR card still renders.
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("view-only-banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Send" })).toBeDisabled();
  await expect(page.getByText(MOCK_ADDRESS).first()).toBeVisible();

  // Deposits — create disabled, but the page (summary/list) still renders.
  await page.getByRole("link", { name: "Deposits", exact: true }).click();
  await expect(page.getByTestId("view-only-banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "New Deposit" }).first()).toBeDisabled();

  // Messages — New Message disabled, list still renders.
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page.getByTestId("view-only-banner")).toBeVisible();
  await expect(page.getByRole("button", { name: "New Message" })).toBeDisabled();

  // Receive — fully usable (banner present, address shown).
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible();
  await expect(page.getByText(MOCK_ADDRESS).first()).toBeVisible();
});

test("a normal mock wallet shows no view-only banner and Send is enabled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();
  await expect(page.getByTestId("view-only-banner")).toHaveCount(0);

  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review Send" })).toBeEnabled();
});

import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const RECIPIENT = `ccx7${"b".repeat(94)}`; // schema-valid 98-char address

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

test("adds a recurring reminder and pre-fills the send form from it", async ({ page }) => {
  await openWallet(page);

  await expect(async () => {
    await page.getByRole("link", { name: "Scheduled", exact: true }).click({ timeout: 2000 });
    await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await page.getByLabel("Name").fill("Rent");
  await page.getByLabel("Amount (CCX)").fill("5");
  await page.getByLabel("Recipient address").fill(RECIPIENT);
  await page.getByLabel("First due date").fill("2020-01-01"); // past → due now

  await page.getByRole("button", { name: "Add reminder" }).click();

  // Appears in the list, flagged due (past start date).
  await expect(page.getByText("Rent", { exact: true })).toBeVisible();
  await expect(page.getByText("Due", { exact: true })).toBeVisible();

  // "Send now" deep-links into the send flow pre-filled from the reminder; the
  // draft is recognized and advances straight to the confirm dialog (review).
  await page.getByRole("button", { name: "Send now" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Confirm send" })).toBeVisible();
  await expect(dialog.getByText("Total")).toBeVisible();
  await page.keyboard.press("Escape"); // never auto-send — back out

  // Persists across reload (localStorage).
  await page.goto("/wallet/scheduled");
  await expect(page.getByText("Rent", { exact: true })).toBeVisible();
});

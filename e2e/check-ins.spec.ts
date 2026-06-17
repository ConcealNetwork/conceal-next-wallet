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

test("watch a contact for check-ins, snooze and remove", async ({ page }) => {
  await openWallet(page);

  await expect(async () => {
    await page.getByRole("link", { name: "Check-ins", exact: true }).click({ timeout: 2000 });
    await expect(page.getByRole("heading", { name: "Check-ins" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Watch a mock contact.
  await page.getByLabel("Contact").selectOption({ label: "Alice" });
  await page.getByLabel("Every (days)").fill("14");
  await page.getByRole("button", { name: "Watch", exact: true }).click();

  // It appears under "Watching" with a status line.
  const watching = page.locator("ul li", { hasText: "Alice" });
  await expect(watching).toBeVisible();

  // One-tap "Send check-in" sends a smart-message ping (mock send → toast).
  await watching.getByRole("button", { name: "Send check-in" }).click();
  await expect(page.getByText(/Check-in sent to Alice/i)).toBeVisible();

  // Snooze → a Resume control replaces Snooze/Pause.
  await watching.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(watching.getByRole("button", { name: "Resume" })).toBeVisible();

  // Persists across reload — contact AND its interval.
  await page.goto("/wallet/check-ins");
  const persisted = page.locator("ul li", { hasText: "Alice" });
  await expect(persisted).toBeVisible();
  await expect(persisted.getByText(/every 14d/i)).toBeVisible();

  // Remove.
  await page
    .locator("ul li", { hasText: "Alice" })
    .getByRole("button", { name: "Stop watching Alice" })
    .click();
  await expect(page.getByText("Not watching anyone yet.")).toBeVisible();
});

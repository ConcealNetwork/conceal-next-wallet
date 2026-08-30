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

test("broadcast and view pulse", async ({ page }) => {
  await openWallet(page);

  await expect(async () => {
    await page.getByRole("link", { name: "Pulse", exact: true }).click({ timeout: 2000 });
    await expect(page.getByRole("heading", { name: "Pulse" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await page.getByLabel("Contact").selectOption({ label: "Alice" });
  await page.getByRole("button", { name: "Broadcast" }).click();
  await expect(page.getByText(/Pulse sent to Alice/i)).toBeVisible();
});

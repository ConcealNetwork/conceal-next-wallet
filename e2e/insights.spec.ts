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

test("shows on-device activity insights", async ({ page }) => {
  await openWallet(page);

  await expect(async () => {
    await page.getByRole("link", { name: "Insights", exact: true }).click({ timeout: 2000 });
    await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Mock wallet has history → the summary renders.
  await expect(page.getByText("Total received")).toBeVisible();
  await expect(page.getByText("Interest earned")).toBeVisible();
  await expect(page.getByText("Monthly flow")).toBeVisible();
  await expect(page.getByText("Activity breakdown")).toBeVisible();
  // Privacy promise is stated.
  await expect(page.getByText(/nothing here leaves your browser/i)).toBeVisible();
});

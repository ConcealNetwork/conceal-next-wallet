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
    // level:1 disambiguates the page h1 from the Insights rail's section heading.
    await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 20_000 });

  // Mock wallet has history → the summary renders. Scope to main + first: the
  // Insights rail repeats some of these labels (and the <1200px embedded fallback
  // is in the DOM), so an unscoped getByText is ambiguous under strict mode.
  const main = page.getByRole("main");
  await expect(main.getByText("Total received").first()).toBeVisible();
  await expect(main.getByText("Interest earned").first()).toBeVisible();
  await expect(main.getByText("Monthly flow").first()).toBeVisible();
  await expect(main.getByText("Activity breakdown").first()).toBeVisible();
  // Privacy promise is stated.
  await expect(main.getByText(/nothing here leaves your browser/i).first()).toBeVisible();
});

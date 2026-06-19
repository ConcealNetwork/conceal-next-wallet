import { expect, test } from "@playwright/test";

/**
 * Multi-wallet switcher + management (#95), mock mode. The mock engine seeds two
 * wallets ("Main wallet", "Savings"); the sidebar-header dropdown switches between
 * them and Settings → Wallets renames them.
 */

async function openWallet(page: import("@playwright/test").Page) {
  await page.goto("/");
  const overview = page.getByRole("heading", { name: "Account Overview" });
  // The landing CTA is a no-op until it hydrates (can lag on a cold runner) —
  // retry the click until the account page renders.
  await expect(async () => {
    if (!(await overview.isVisible())) {
      await page
        .getByRole("button", { name: "Open your wallet" })
        .click({ timeout: 2000 });
    }
    await expect(overview).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

test("switches the active wallet via the sidebar-header dropdown", async ({ page }) => {
  await openWallet(page);

  // The switcher trigger shows the active wallet under the brand.
  const trigger = page.getByRole("button", { name: "Switch wallet" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("Main wallet");

  // Open the dropdown and switch to "Savings".
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Switch wallet" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: /Main wallet/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitemradio", { name: /Switch to Savings/ }).click();

  // The active wallet label updates (mock switch keeps the session open).
  await expect(trigger).toContainText("Savings");
});

test("the switcher offers both Create new and Import existing", async ({ page }) => {
  await openWallet(page);
  await page.getByRole("button", { name: "Switch wallet" }).click();
  await page.getByRole("menuitem", { name: "Create new" }).click();
  await expect(page).toHaveURL(/\/create\/?$/);

  await page.goBack();
  await page.getByRole("button", { name: "Switch wallet" }).click();
  await page.getByRole("menuitem", { name: "Import existing" }).click();
  await expect(page).toHaveURL(/\/import\/?$/);
});

test("Settings lists wallets and renames one", async ({ page }) => {
  await openWallet(page);

  // Navigate to Settings (retry the nav click until hydrated).
  const settingsHeading = page.getByRole("heading", { name: "Settings" });
  await expect(async () => {
    if (!(await settingsHeading.isVisible())) {
      await page.getByRole("link", { name: "Settings", exact: true }).click({ timeout: 2000 });
    }
    await expect(settingsHeading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // The Wallets management list shows both seeded wallets.
  const savingsItem = page.getByRole("listitem").filter({ hasText: "Savings" });
  await expect(savingsItem).toBeVisible();

  // Rename "Savings" inline.
  await savingsItem.getByRole("button", { name: /Rename Savings/ }).click();
  const nameInput = page.getByRole("textbox", { name: "Wallet name" });
  await nameInput.fill("Holiday fund");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Holiday fund" })).toBeVisible();
});

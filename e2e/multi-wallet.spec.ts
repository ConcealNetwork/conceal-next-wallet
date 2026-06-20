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
      await page.getByRole("button", { name: "Open your wallet" }).click({ timeout: 2000 });
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

test("switching stays on the current page — no landing bounce (smooth switching)", async ({
  page,
}) => {
  await openWallet(page);

  // Navigate to a non-account page (Transactions), retrying the nav until hydrated.
  const txHeading = page.getByRole("heading", { name: "Transaction History" });
  await expect(async () => {
    if (!(await txHeading.isVisible())) {
      await page.getByRole("link", { name: "Transactions", exact: true }).click({ timeout: 2000 });
    }
    await expect(txHeading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/wallet\/transactions\/?$/);

  // Switch wallets from here. The switch must be INSTANT and keep us on this page —
  // no bounce to the landing route (`/`) and no re-unlock prompt. Retry the dropdown
  // interaction until the label flips (covers post-nav hydration on a cold runner).
  const trigger = page.getByRole("button", { name: "Switch wallet" });
  await expect(async () => {
    await trigger.click({ timeout: 2000 });
    const menu = page.getByRole("menu", { name: "Switch wallet" });
    await menu.getByRole("menuitemradio", { name: /Switch to Savings/ }).click({ timeout: 2000 });
    await expect(trigger).toContainText("Savings", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Still on Transactions — the switch did not route us away.
  await expect(page).toHaveURL(/\/wallet\/transactions\/?$/);
  await expect(txHeading).toBeVisible();
});

test("the switcher offers both Create new and Import existing", async ({ page }) => {
  await openWallet(page);

  // Open the dropdown. Retry until hydrated; only click the trigger when the menu
  // isn't already open, so a retry never toggles it back closed.
  const createItem = page.getByRole("menuitem", { name: "Create new" });
  await expect(async () => {
    if (!(await createItem.isVisible())) {
      await page.getByRole("button", { name: "Switch wallet" }).click({ timeout: 2000 });
    }
    await expect(createItem).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  // Both creation paths are offered in the same open dropdown.
  await expect(createItem).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Import existing" })).toBeVisible();

  // And the option navigates to the onboarding route.
  await createItem.click();
  await expect(page).toHaveURL(/\/create\/?$/);
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

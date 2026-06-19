import { expect, test } from "@playwright/test";

/**
 * Dual-sidebar shell redesign (#122), mock mode.
 *
 * Stage 1: a sticky global header carries the brand, wallet switcher, sync pill,
 * notifications, and theme toggle; the left sidenav is grouped Wallet/Banking/More.
 * Stage 2: a contextual right rail registered per page — the Account page shows a
 * Market + Holdings + Quick-actions panel that collapses to a narrow strip; pages
 * that register no rail (Transactions) render full width.
 *
 * The rail is desktop-only (hidden < 1200px), so these run at a wide viewport.
 */

test.use({ viewport: { width: 1440, height: 900 } });

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

test("global header carries the brand, switcher, and global chrome", async ({ page }) => {
  await openWallet(page);

  const header = page.getByRole("banner");
  await expect(header).toBeVisible();
  // Brand link, wallet switcher, notifications, and theme toggle all live in the header.
  await expect(header.getByRole("link", { name: "Conceal wallet" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Switch wallet" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Open notifications" })).toBeVisible();
  await expect(header.getByRole("button", { name: /Theme:/ })).toBeVisible();
});

test("Account page registers a contextual right rail", async ({ page }) => {
  await openWallet(page);

  const rail = page.getByRole("complementary", { name: "Context panel" });
  await expect(rail).toBeVisible();
  // The Account rail summarises market, holdings, and quick actions.
  await expect(rail.getByRole("heading", { name: "Market" })).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Holdings" })).toBeVisible();
  await expect(rail.getByRole("heading", { name: "Quick actions" })).toBeVisible();
  // Quick actions use distinct aria labels so they don't collide with sidenav links.
  await expect(rail.getByRole("link", { name: "Send CCX" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Create a deposit" })).toBeVisible();
});

test("the rail collapse pin shrinks the column to an expand strip", async ({ page }) => {
  await openWallet(page);

  const rail = page.getByRole("complementary", { name: "Context panel" });
  await expect(rail.getByRole("heading", { name: "Market" })).toBeVisible();

  // Collapse: the panel header pin hides the content and leaves a narrow strip.
  await rail.getByRole("button", { name: "Collapse panel" }).click();
  await expect(rail.getByRole("heading", { name: "Market" })).toBeHidden();
  const expand = rail.getByRole("button", { name: "Expand panel" });
  await expect(expand).toBeVisible();

  // Expand restores the full panel.
  await expand.click();
  await expect(rail.getByRole("heading", { name: "Market" })).toBeVisible();
});

test("pages without a registered rail render full width", async ({ page }) => {
  await openWallet(page);

  // Account has a rail.
  await expect(page.getByRole("complementary", { name: "Context panel" })).toBeVisible();

  // Navigate to Address Book, which registers no rail (only Account + Transactions do).
  await page.getByRole("link", { name: "Address Book", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet\/address-book\/?$/);

  // The context panel is gone — the rail cleared on unmount.
  await expect(page.getByRole("complementary", { name: "Context panel" })).toHaveCount(0);
});

test("small screens fall back to an inline summary (rail column hidden < 1200px)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 860, height: 900 });
  await openWallet(page);

  // The rail column is hidden below 1200px (getByRole excludes hidden subtrees).
  await expect(page.getByRole("complementary", { name: "Context panel" })).toBeHidden();
  // ...but its Market + Quick-actions summary is surfaced inline in the body instead,
  // so narrow viewports never lose it.
  await expect(page.getByRole("heading", { name: "Market" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a deposit" })).toBeVisible();
});

async function openTransactions(page: import("@playwright/test").Page) {
  await openWallet(page);
  const txHeading = page.getByRole("heading", { name: "Transaction History" });
  await expect(async () => {
    if (!(await txHeading.isVisible())) {
      await page.getByRole("link", { name: "Transactions", exact: true }).click({ timeout: 2000 });
    }
    await expect(txHeading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

test("Transactions page shows a detail rail; selecting a row fills it (wide)", async ({ page }) => {
  await openTransactions(page);

  const rail = page.getByRole("complementary", { name: "Context panel" });
  await expect(rail).toBeVisible();
  // No selection → hint, not detail.
  await expect(rail.getByText("No transaction selected")).toBeVisible();

  // Select the first transaction row.
  await page.getByRole("button", { name: /transaction for/ }).first().click();

  // Detail appears in the rail (not a dialog), with the back affordance.
  await expect(rail.getByText("No transaction selected")).toBeHidden();
  await expect(rail.getByRole("button", { name: "Back to list" })).toBeVisible();
  await expect(rail.getByText("Amount", { exact: true })).toBeVisible();
  // The detail dialog must NOT open at wide widths (the rail replaces it).
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Back clears the selection.
  await rail.getByRole("button", { name: "Back to list" }).click();
  await expect(rail.getByText("No transaction selected")).toBeVisible();
});

test("Transactions detail uses the dialog below the rail breakpoint (narrow)", async ({ page }) => {
  // Navigate at the wide default (sidenav links visible), then shrink: below the
  // breakpoint the rail is hidden and the transaction rows live in the page body.
  await openTransactions(page);
  await page.setViewportSize({ width: 860, height: 900 });

  await expect(page.getByRole("complementary", { name: "Context panel" })).toBeHidden();
  await page.getByRole("button", { name: /transaction for/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Transactions detail falls back to the dialog when the rail is collapsed (wide)", async ({
  page,
}) => {
  await openTransactions(page);
  const rail = page.getByRole("complementary", { name: "Context panel" });
  await expect(rail).toBeVisible();

  // Collapse the rail to its strip — the detail can no longer render there.
  await rail.getByRole("button", { name: "Collapse panel" }).click();

  // Selecting a row now opens the dialog instead of showing nothing.
  await page.getByRole("button", { name: /transaction for/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

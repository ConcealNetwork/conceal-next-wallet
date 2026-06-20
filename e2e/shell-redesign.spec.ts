import { expect, test } from "@playwright/test";

/**
 * Dual-sidebar shell redesign (#122), mock mode.
 *
 * Stage 1: a sticky global header carries the brand, wallet switcher, sync pill,
 * notifications, theme toggle, and a far-right rail toggle; the left sidenav is
 * grouped Wallet/Earn/More.
 * Stage 2: a contextual right rail registered per page — the Account page shows a
 * Market + Holdings + Quick-actions panel that the header toggle collapses away
 * fully; pages that register no rail (Transactions) render full width.
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

test("the global-header rail toggle collapses the panel away fully", async ({ page }) => {
  await openWallet(page);

  const header = page.getByRole("banner");
  await expect(
    page
      .getByRole("complementary", { name: "Context panel" })
      .getByRole("heading", { name: "Market" }),
  ).toBeVisible();

  // Collapse: the header toggle removes the rail column entirely (no leftover strip).
  await header.getByRole("button", { name: "Collapse panel" }).click();
  await expect(page.getByRole("complementary", { name: "Context panel" })).toHaveCount(0);

  // Expand restores the full panel.
  await header.getByRole("button", { name: "Expand panel" }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Context panel" })
      .getByRole("heading", { name: "Market" }),
  ).toBeVisible();
});

test("pages without a registered rail render full width", async ({ page }) => {
  await openWallet(page);

  // Account has a rail.
  await expect(page.getByRole("complementary", { name: "Context panel" })).toBeVisible();

  // Navigate to Messages, which registers no contextual rail.
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page).toHaveURL(/\/wallet\/messages\/?$/);

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
  // No selection → the recent-tx list (no detail panel yet).
  await expect(rail.getByRole("button", { name: "Back to list" })).toHaveCount(0);

  // Select the first transaction row from the main table.
  await page
    .getByRole("button", { name: /transaction for/ })
    .first()
    .click();

  // Detail appears in the rail (not a dialog), with the back affordance.
  await expect(rail.getByRole("button", { name: "Back to list" })).toBeVisible();
  await expect(rail.getByText("Amount", { exact: true })).toBeVisible();
  // The detail dialog must NOT open at wide widths (the rail replaces it).
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Back returns the rail to the list.
  await rail.getByRole("button", { name: "Back to list" }).click();
  await expect(rail.getByRole("button", { name: "Back to list" })).toHaveCount(0);
});

test("Transactions detail uses the dialog below the rail breakpoint (narrow)", async ({ page }) => {
  // Navigate at the wide default (sidenav links visible), then shrink: below the
  // breakpoint the rail is hidden and the transaction rows live in the page body.
  await openTransactions(page);
  await page.setViewportSize({ width: 860, height: 900 });

  await expect(page.getByRole("complementary", { name: "Context panel" })).toBeHidden();
  await page
    .getByRole("button", { name: /transaction for/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Transactions detail falls back to the dialog when the rail is collapsed (wide)", async ({
  page,
}) => {
  await openTransactions(page);
  const header = page.getByRole("banner");
  const rail = page.getByRole("complementary", { name: "Context panel" });
  await expect(rail).toBeVisible();

  // Collapse the rail away via the header toggle — the detail can no longer render there.
  await header.getByRole("button", { name: "Collapse panel" }).click();
  await expect(rail).toHaveCount(0);

  // Selecting a row now opens the dialog instead of showing nothing.
  await page
    .getByRole("button", { name: /transaction for/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

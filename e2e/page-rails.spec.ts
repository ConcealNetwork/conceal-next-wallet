import { expect, test } from "@playwright/test";

/**
 * Contextual right rails on the secondary wallet pages (#122), mock mode.
 *
 * Market / Network / Insights / Address Book each register a per-page rail that
 * the shell renders in the right column at ≥1200px. These assert the panel
 * mounts with the page's distinctive content (each label is unique to the rail,
 * scoped to the complementary panel so it can't match the page body).
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function openWallet(page: import("@playwright/test").Page) {
  await page.goto("/");
  const overview = page.getByRole("heading", { name: "Account Overview" });
  await expect(async () => {
    if (!(await overview.isVisible())) {
      await page.getByRole("button", { name: "Open your wallet" }).click({ timeout: 2000 });
    }
    await expect(overview).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

const RAIL_PAGES = [
  { path: "/wallet/market", label: "Circulating supply" },
  { path: "/wallet/network", label: "Block Height" },
  { path: "/wallet/insights", label: "Net flow" },
  { path: "/wallet/address-book", label: "Create New" },
] as const;

for (const { path, label } of RAIL_PAGES) {
  test(`${path} registers a contextual rail`, async ({ page }) => {
    await openWallet(page);
    await page.goto(path);

    const rail = page.getByRole("complementary", { name: "Context panel" });
    await expect(rail).toBeVisible();
    // The rail fetches its own data — the label appears once it resolves.
    await expect(rail.getByText(label).first()).toBeVisible({ timeout: 15_000 });
  });
}

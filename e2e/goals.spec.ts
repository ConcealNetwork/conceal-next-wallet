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

test("create a goal, log a contribution to completion, then archive it", async ({ page }) => {
  await openWallet(page);

  await page.goto("/wallet/goals");
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByText("No goals yet")).toBeVisible();

  // Create a goal (no deadline, target 1000 CCX).
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Name").fill("Test goal");
  await page.getByLabel("Target (CCX)").fill("1000");
  await page.getByRole("button", { name: "Create goal" }).click();

  // Card appears, not yet started.
  await expect(page.getByRole("heading", { name: "Test goal" })).toBeVisible();
  await expect(page.getByText("Not started")).toBeVisible();

  // Log a contribution that meets the target.
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByLabel("Amount (CCX)").fill("1000");
  await page.getByRole("button", { name: "Log it" }).click();

  // Goal is met.
  await expect(page.getByText("Goal met")).toBeVisible();

  // Persists across reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Test goal" })).toBeVisible();
  await expect(page.getByText("Goal met")).toBeVisible();

  // Archive via the card overflow menu → moves under the Archived disclosure.
  await page.getByRole("button", { name: "Goal actions" }).first().click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: /Archived \(1\)/ })).toBeVisible();
});

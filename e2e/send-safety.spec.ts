import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

// A schema-valid recipient (ccx7 + 94 chars = 98) that is not this wallet's own
// address — enough to open the confirm dialog in mock mode.
const RECIPIENT = `ccx7${"b".repeat(94)}`;

async function openSend(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  // Wait for the wallet shell to hydrate before a client-side nav click.
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send CCX" })).toBeVisible();
}

test("warns about locked deposits when a send exceeds the available balance", async ({ page }) => {
  await openSend(page);

  await page.getByLabel("Destination Address").fill(RECIPIENT);
  // Mock wallet: 634.75 available, 500 locked in deposits. Sending 700 exceeds
  // available, so the locked-deposit shortfall warning is relevant.
  await page.getByLabel("Amount to Send").fill("700");
  await page.getByRole("button", { name: "Review Send" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Confirm send" })).toBeVisible();
  await expect(dialog.getByText(/locked in deposits until maturity/i)).toBeVisible();
  // The amount summary still renders alongside the warning.
  await expect(dialog.getByText("Total")).toBeVisible();
});

test("shows no locked-deposit warning for a send covered by the available balance", async ({
  page,
}) => {
  await openSend(page);

  await page.getByLabel("Destination Address").fill(RECIPIENT);
  await page.getByLabel("Amount to Send").fill("10");
  await page.getByRole("button", { name: "Review Send" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Confirm send" })).toBeVisible();
  await expect(dialog.getByText(/locked in deposits/i)).toHaveCount(0);
});

test("links validation errors to the field for screen readers", async ({ page }) => {
  await openSend(page);

  // An invalid (too-short) address should fail schema validation on submit.
  await page.getByLabel("Destination Address").fill("ccx7-too-short");
  await page.getByRole("button", { name: "Review Send" }).click();

  // The field is flagged invalid and the error is exposed as a live alert that
  // the input points at via aria-describedby.
  const address = page.getByLabel("Destination Address");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(address).toHaveAttribute("aria-describedby", "address-hint");
  const hint = page.locator("#address-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute("role", "alert");
});

import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

// A schema-valid recipient (ccx7 + 94 chars = 98) for the send confirm dialog.
const RECIPIENT = `ccx7${"b".repeat(94)}`;

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

test("Tab moves focus onto an interactive control", async ({ page }) => {
  await openWallet(page);
  await page.keyboard.press("Tab");
  const tag = await page.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]).toContain(tag);
});

test("nav links activate with the keyboard (Enter)", async ({ page }) => {
  await openWallet(page);
  const send = page.getByRole("link", { name: "Send", exact: true });
  await expect(async () => {
    await send.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Send CCX" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("the send confirmation dialog closes on Escape (Radix focus management)", async ({ page }) => {
  await openWallet(page);
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send CCX" })).toBeVisible();

  await page.getByLabel("Destination Address").fill(RECIPIENT);
  await page.getByLabel("Amount to Send").fill("10");
  await page.getByRole("button", { name: "Review Send" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Confirm send" })).toBeVisible();

  // Escape dismisses the modal and the form is restored (Radix traps + restores focus).
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Send CCX" })).toBeVisible();
});

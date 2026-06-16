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

test("applies a persisted light theme and toggles globally from the sidebar", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ccx-theme", "light");
    } catch {}
  });
  await openWallet(page);

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  // The globally-available sidebar control cycles Light → Dark.
  await page.getByRole("button", { name: /^Theme: Light/ }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("ccx-theme"))).toBe("dark");
});

test("follows the system preference when set to system", async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("ccx-theme", "system");
    } catch {}
  });
  await page.emulateMedia({ colorScheme: "light" });
  await openWallet(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

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

test("switches the UI language and persists it", async ({ page }) => {
  await openWallet(page);

  // English by default: sidebar shows "Send".
  await expect(page.getByRole("link", { name: "Send", exact: true })).toBeVisible();

  // Go to Settings and pick Español.
  const settingsLink = page.getByRole("link", { name: "Settings", exact: true });
  await expect(async () => {
    if (!(await page.getByRole("heading", { name: "Settings" }).isVisible())) {
      await settingsLink.click({ timeout: 2000 });
    }
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await page.getByLabel("Language").selectOption("es");

  // Sidebar nav is now Spanish.
  await expect(page.getByRole("link", { name: "Enviar", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recibir", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send", exact: true })).toHaveCount(0);

  // Persists across a reload (localStorage).
  await page.reload();
  await expect(page.getByRole("link", { name: "Enviar", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ccx-locale"))).toBe("es");
});

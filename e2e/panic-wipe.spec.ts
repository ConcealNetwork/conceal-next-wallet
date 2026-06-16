import { expect, test } from "@playwright/test";

test("panic wipe erases local data and returns to the open-wallet screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // Probe key so we can prove localStorage was actually cleared.
  await page.evaluate(() => localStorage.setItem("__wipe_probe__", "1"));

  // Open the panic-wipe dialog; the action stays disabled until "ERASE" is typed.
  await page.getByRole("button", { name: "Erase everything" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Erase all local data?")).toBeVisible();

  const confirmButton = dialog.getByRole("button", { name: "Erase everything" });
  await expect(confirmButton).toBeDisabled();
  await dialog.getByLabel(/Type ERASE to confirm/i).fill("ERASE");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  // Back at the landing / open-wallet screen, with local storage erased.
  await expect(page.getByRole("button", { name: "Open your wallet" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("__wipe_probe__"))).toBeNull();
});

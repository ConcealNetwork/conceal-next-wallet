import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function openTransactions(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transaction History" })).toBeVisible();
}

async function openFirstTransaction(page: Page) {
  await page
    .getByRole("button", { name: /transaction for/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

const NOTE = "Reimburse Ana for lunch 🍜";

test("attaches a private note to a transaction and persists it across reloads", async ({
  page,
}) => {
  await openTransactions(page);

  // Add a note.
  let dialog = await openFirstTransaction(page);
  await dialog.getByRole("button", { name: "Add a note" }).click();
  const field = dialog.getByRole("textbox", { name: "Transaction note" });
  await field.fill(NOTE);
  await dialog.getByRole("button", { name: "Save" }).click();

  // Read view now shows the note + an Edit affordance (no more "Add a note").
  await expect(dialog.getByText(NOTE)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add a note" })).toHaveCount(0);

  // Close and reopen the same transaction — the note is still there.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  dialog = await openFirstTransaction(page);
  await expect(dialog.getByText(NOTE)).toBeVisible();

  // Reload (fresh page → IndexedDB-backed note survives).
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  dialog = await openFirstTransaction(page);
  await expect(dialog.getByText(NOTE)).toBeVisible();

  // Clearing the note removes it (back to the "Add a note" affordance).
  await dialog.getByRole("button", { name: "Edit" }).click();
  await dialog.getByRole("textbox", { name: "Transaction note" }).fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("button", { name: "Add a note" })).toBeVisible();
});

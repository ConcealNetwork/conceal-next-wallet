import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function openTransactions(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Transaction History" })).toBeVisible();
}

test("exports the transaction list to a CSV with BOM + header", async ({ page }) => {
  await openTransactions(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^conceal-transactions-\d{4}-\d{2}-\d{2}\.csv$/);

  const buf = await readFile((await download.path()) ?? "");
  // UTF-8 BOM so Excel decodes correctly.
  expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);

  const text = buf.subarray(3).toString("utf8");
  expect(text.startsWith("Date,Type,Direction,Amount (CCX)")).toBe(true);
  expect(text.includes("\r\n")).toBe(true);
  // 8 mock transactions + 1 header row.
  expect(text.split("\r\n").filter(Boolean).length).toBe(9);
});

test("filtered export encodes the filter in the filename and exports a subset", async ({ page }) => {
  await openTransactions(page);
  await page.getByRole("button", { name: "Sent", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^conceal-transactions-sent-\d{4}-\d{2}-\d{2}\.csv$/);

  const text = (await readFile((await download.path()) ?? "")).subarray(3).toString("utf8");
  const rows = text.split("\r\n").filter(Boolean);
  expect(rows.length).toBeGreaterThan(1); // header + at least one send
  expect(rows.length).toBeLessThan(9); // fewer than the full list
});

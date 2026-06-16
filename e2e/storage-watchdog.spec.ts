import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

/** Override navigator.storage before any app code runs. */
async function stubStorage(page: Page, opts: { persisted: boolean; usage: number; quota: number }) {
  await page.addInitScript((o) => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persist: () => Promise.resolve(o.persisted),
        persisted: () => Promise.resolve(o.persisted),
        estimate: () => Promise.resolve({ usage: o.usage, quota: o.quota }),
      },
    });
  }, opts);
}

async function openWallet(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();
  const account = page.getByRole("heading", { name: "Account Overview" });
  // The landing heading is server-rendered, so its visibility doesn't imply the
  // "Open your wallet" button's onClick has hydrated — a click before then is a
  // no-op. Retry the click until the wallet actually opens.
  await expect(async () => {
    if (!(await account.isVisible())) {
      await page.getByRole("button", { name: "Open your wallet" }).click({ timeout: 2000 });
    }
    await expect(account).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

test("prompts a backup when durable storage is denied", async ({ page }) => {
  await stubStorage(page, { persisted: false, usage: 0, quota: 1_000_000_000 });
  await openWallet(page);

  const banner = page.getByTestId("storage-warning-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: /Back up now/i })).toHaveAttribute(
    "href",
    /\/wallet\/export\/?$/,
  );
});

test("prompts a backup when the quota is nearly exhausted", async ({ page }) => {
  // Durable, but only ~10 MB free of 1 GB → below the absolute free-space floor.
  await stubStorage(page, { persisted: true, usage: 990_000_000, quota: 1_000_000_000 });
  await openWallet(page);

  await expect(page.getByTestId("storage-warning-banner")).toBeVisible();
});

test("stays quiet when storage is durable and roomy", async ({ page }) => {
  await stubStorage(page, { persisted: true, usage: 1_000, quota: 1_000_000_000 });
  await openWallet(page);

  await expect(page.getByTestId("storage-warning-banner")).toHaveCount(0);
});

test("can be dismissed for the session", async ({ page }) => {
  await stubStorage(page, { persisted: false, usage: 0, quota: 1_000_000_000 });
  await openWallet(page);

  const banner = page.getByTestId("storage-warning-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss storage warning" }).click();
  await expect(banner).toHaveCount(0);

  // Navigating elsewhere keeps it dismissed for the session.
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible();
  await expect(page.getByTestId("storage-warning-banner")).toHaveCount(0);
});

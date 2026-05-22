import { expect, test } from "@playwright/test"

test("open wallet, send, receive, and disconnect", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /The next generation wallet is here/ })).toBeVisible()

  await page.getByRole("button", { name: /Open Wallet/ }).click()
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible()
  await expect(page.getByText("1,250.50 CCX")).toBeVisible()

  await page.getByRole("link", { name: /Send/ }).click()
  await page.getByLabel("Destination Address").fill("ccx7PlaywrightMockAddressT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m")
  await page.getByLabel("Amount to Send").fill("12.5")
  await page.getByRole("button", { name: "Send" }).click()
  await expect(page.getByText("Mock transaction submitted. No CCX was sent.")).toBeVisible()

  await page.getByRole("link", { name: /Receive/ }).click()
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible()
  await expect(page.locator("svg").first()).toBeVisible()
  await expect(page.getByText(/^ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m$/)).toBeVisible()

  await page.getByRole("button", { name: /Disconnect/ }).click()
  await expect(page.getByRole("heading", { name: /The next generation wallet is here/ })).toBeVisible()
})

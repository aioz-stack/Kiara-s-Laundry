import { expect, test } from "@playwright/test";
import { createOrder, recordPayment, signIn, statCard } from "./helpers";

test("a cashier takes an order, a partial payment, and settles it", async ({ page }) => {
  await signIn(page, "CASHIER");
  await createOrder(page, "Partial Payer");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/^KL-\d{8}-\d{4}$/);
  await expect(statCard(page, "Balance")).toContainText("₱300.00");

  await recordPayment(page, "100.00");
  await expect(statCard(page, "Balance")).toContainText("₱200.00");

  // The dialog offers the remaining balance by default.
  await recordPayment(page);
  await expect(statCard(page, "Balance")).toContainText("₱0.00");
  await expect(page.getByRole("button", { name: "Record payment" })).toBeHidden();

  await page.getByRole("link", { name: "Receipt" }).click();
  const receipt = page.getByRole("article");
  await expect(receipt).toContainText("Partial Payer");
  await expect(receipt).toContainText("₱300.00");
  await expect(receipt).toContainText("-₱17.50");
});

test("the server refuses to overpay an order", async ({ page }) => {
  await signIn(page, "CASHIER");
  await createOrder(page, "Over Payer");
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Amount").fill("300.01");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("dialog")).toContainText("more than the remaining balance");
});

test("an admin reverses a payment, and it leaves the collected total", async ({ page }) => {
  await signIn(page, "ADMIN");
  await createOrder(page, "Reversal Case");
  await recordPayment(page, "50.00");
  await expect(statCard(page, "Balance")).toContainText("₱250.00");

  const orderUrl = page.url();
  await page.goto("/payments?q=Reversal");
  await expect(statCard(page, "Collected")).toContainText("₱50.00");

  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Reverse" }).click();
  await page.getByRole("button", { name: "Reverse entry" }).click();
  await expect(page.getByRole("dialog")).toContainText("Give a reason");
  await page.getByLabel("Reason").fill("Keyed by mistake");
  await page.getByRole("button", { name: "Reverse entry" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(statCard(page, "Balance")).toContainText("₱300.00");

  await page.goto("/payments?q=Reversal");
  await expect(statCard(page, "Collected")).toContainText("₱0.00");
  await expect(page.getByRole("cell", { name: "Reversed" })).toBeVisible();
});

test("voiding needs a reason and removes the order from sales", async ({ page }) => {
  await signIn(page, "OWNER");
  await page.goto("/reports");
  const before = await statCard(page, "Gross sales").textContent();

  await createOrder(page, "Void Case");
  const receiptNumber = await page.getByRole("heading", { level: 1 }).textContent();
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByLabel("Reason").fill("Customer cancelled");
  await page.getByRole("button", { name: "Void order" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Customer cancelled");

  await page.goto("/reports");
  expect(await statCard(page, "Gross sales").textContent()).toBe(before);

  await page.goto(`/transactions?q=${receiptNumber}`);
  await expect(page.locator("tbody").getByText("Cancelled", { exact: true })).toBeVisible();
});

test("a service price change leaves past orders alone", async ({ page }) => {
  await signIn(page, "ADMIN");
  await createOrder(page, "Price History");
  const orderUrl = page.url();

  await page.goto("/services");
  await page.getByRole("row", { name: /Iron/ }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Current price").fill("99.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row", { name: /Iron/ })).toContainText("₱99.00");

  await page.goto(orderUrl);
  await expect(page.getByRole("row", { name: /Iron/ })).toContainText("₱35.00");
  await expect(statCard(page, "Total")).toContainText("₱300.00");

  await page.goto("/services");
  await page.getByRole("row", { name: /Iron/ }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Current price").fill("35.00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row", { name: /Iron/ })).toContainText("₱35.00");
});

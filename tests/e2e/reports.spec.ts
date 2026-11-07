import { expect, test } from "@playwright/test";
import { createOrder, recordPayment, signIn, statCard } from "./helpers";

test("an expense reaches the report, net cash flow, and the CSV", async ({ page }) => {
  await signIn(page, "OWNER");
  await createOrder(page, "Report Case");
  await recordPayment(page, "300.00");

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Record expense" }).click();
  await page.getByLabel("Description").fill("E2E rent");
  await page.getByLabel("Category").last().selectOption("e2e-rent");
  await page.getByLabel("Amount").fill("120.00");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("cell", { name: "E2E rent" })).toBeVisible();

  await page.goto("/reports");
  const collected = (await statCard(page, "Collected").locator("p").first().textContent()) ?? "";
  const expenses = (await statCard(page, "Expenses").locator("p").first().textContent()) ?? "";
  const cents = (text: string) => Math.round(Number(text.replace(/[^0-9.-]/g, "")) * 100);
  const expected = cents(collected) - cents(expenses);
  const netCashFlow = await statCard(page, "Net cash flow").locator("p").first().textContent();
  expect(cents(netCashFlow ?? "")).toBe(expected);

  const link = page.getByRole("link", { name: "CSV" }).first();
  const href = await link.getAttribute("href");
  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  expect(csv).toContain(`Collected,${(cents(collected) / 100).toFixed(2)}`);
  expect(csv).toContain(`Expenses,${(cents(expenses) / 100).toFixed(2)}`);
  expect(csv).toContain(`Net cash flow,${(expected / 100).toFixed(2)}`);
});

test("the print view hides navigation and controls", async ({ page }) => {
  await signIn(page, "OWNER");
  await page.goto("/reports");
  await expect(page.getByRole("button", { name: "Print report" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print report" })).toBeHidden();
  await expect(page.getByRole("complementary")).toBeHidden();
  await expect(statCard(page, "Gross sales")).toBeVisible();
});

test("the layout works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "OWNER");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Expenses" }).click();
  await expect(page).toHaveURL(/expenses/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

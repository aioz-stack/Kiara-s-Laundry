import { expect, test } from "@playwright/test";
import { createOrder, signIn } from "./helpers";

test("signed-out visitors reach nothing", async ({ page, request }) => {
  for (const path of ["/dashboard", "/transactions", "/reports", "/users", "/audit-logs"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  const response = await request.get("/api/export/summary?from=2026-01-01&to=2026-01-01");
  expect(response.status()).toBe(401);
});

test("a wrong password does not sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@e2e.local");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Those details did not work.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("a cashier is kept out of restricted pages and exports", async ({ page }) => {
  await signIn(page, "CASHIER");
  for (const path of ["/users", "/audit-logs", "/settings", "/expenses"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    await expect(page.getByRole("alert").first()).toContainText("does not have access");
  }
  await expect(page.getByRole("link", { name: "Users" })).toBeHidden();

  const expenses = await page.request.get("/api/export/expenses?from=2026-01-01&to=2026-01-01");
  expect(expenses.status()).toBe(403);
  const range = await page.request.get("/api/export/summary?from=2026-01-01&to=2026-12-31");
  expect(range.status()).toBe(403);
});

test("staff see orders without amounts and can move them along", async ({ page, browser }) => {
  const cashierContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const cashierPage = await cashierContext.newPage();
  await signIn(cashierPage, "CASHIER");
  await createOrder(cashierPage, "Staff View");
  const orderPath = new URL(cashierPage.url()).pathname;
  await cashierContext.close();

  await signIn(page, "STAFF");
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeHidden();
  await expect(page.locator("main")).not.toContainText("₱");

  await page.goto(orderPath);
  await expect(page.locator("main")).toContainText("Wash");
  await expect(page.locator("main")).not.toContainText("₱");
  await page.getByLabel("Order status").selectOption("WASHING");
  await expect(page.getByText("Status: Washing")).toBeVisible();
  await expect(
    page.getByLabel("Order status").locator("option", { hasText: "Completed" }),
  ).toHaveCount(0);

  await page.goto(`${orderPath}/receipt`);
  await expect(page).toHaveURL(/denied=1/);
  await page.goto("/payments");
  await expect(page).toHaveURL(/denied=1/);

  const response = await page.request.get("/api/export/summary?from=2026-01-01&to=2026-01-01");
  expect(response.status()).toBe(403);
});

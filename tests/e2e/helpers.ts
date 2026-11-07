import { expect, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./constants";

export async function signIn(page: Page, role: keyof typeof E2E_USERS) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USERS[role]);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/login/);
}

/** Creates an order worth ₱300.00 and leaves the browser on its page. */
export async function createOrder(page: Page, customer: string) {
  await page.goto("/transactions/new");
  await page.getByLabel("Name").fill(customer);
  await page.locator("#item-0-service").selectOption("e2e-wash");
  await page.locator("#item-0-quantity").fill("3.5");

  await page.getByRole("button", { name: "Add service" }).click();
  await page.locator("#item-1-service").selectOption("e2e-iron");
  await page.locator("#item-1-quantity").fill("2");

  await page.getByLabel("Discount").fill("17.50");
  await page.getByLabel("Additional charges").fill("20.00");
  await expect(page.locator("form")).toContainText("₱300.00");

  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).toHaveURL(/\/transactions\/c[a-z0-9]+$/);
}

export function statCard(page: Page, label: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: label }).first();
}

export async function recordPayment(page: Page, amount?: string) {
  await page.getByRole("button", { name: "Record payment" }).click();
  if (amount) await page.getByLabel("Amount").fill(amount);
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

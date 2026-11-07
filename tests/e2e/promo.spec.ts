import { expect, test, type Page } from "@playwright/test";
import { recordPayment, signIn, statCard } from "./helpers";

const CUSTOMER = "Promo Fan";
const PROMO = "10+1 Laundry Promo";

async function setPromo(page: Page, state: "On" | "Off") {
  await page.goto("/settings");
  const toggle = page.getByRole("switch");
  if ((await toggle.getAttribute("aria-checked")) !== String(state === "On")) await toggle.click();
  await expect(page.locator("label[for=promo-enabled]")).toHaveText(state);
}

async function fillLoads(page: Page, loads: string) {
  await page.goto("/transactions/new");
  await page.getByLabel("Name").fill(CUSTOMER);
  await page.locator("#item-0-service").selectOption("e2e-load");
  await page.locator("#item-0-quantity").fill(loads);
}

test("the promo earns a free load when on, and disappears when off", async ({ page }) => {
  await signIn(page, "OWNER");
  await setPromo(page, "On");

  await fillLoads(page, "10");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).toHaveURL(/\/transactions\/c[a-z0-9]+$/);
  await recordPayment(page);
  await page.getByLabel("Order status").selectOption("COMPLETED");
  await expect(page.getByLabel("Order status")).toHaveValue("COMPLETED");
  const earningOrder = page.url();

  await page.goto(`${earningOrder}/receipt`);
  await expect(page.getByRole("article")).toContainText(PROMO);
  await expect(page.getByRole("article")).toContainText("1 free load available");

  await fillLoads(page, "2");
  await expect(page.getByLabel(/Use free load/)).toBeChecked();
  await expect(page.locator("form")).toContainText("-₱180.00");
  await page.getByLabel(/Use free load/).uncheck();
  await expect(page.locator("form")).not.toContainText("-₱180.00");
  await page.getByLabel(/Use free load/).check();
  await expect(page.locator("form")).toContainText("-₱180.00");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).toHaveURL(/\/transactions\/c[a-z0-9]+$/);
  await expect(statCard(page, "Total")).toContainText("₱180.00");
  await page.getByRole("link", { name: "Receipt" }).click();
  await expect(page.getByRole("article")).toContainText("Free load");
  const freeLoadReceipt = page.url();

  await fillLoads(page, "1");
  await expect(page.getByLabel(/Use free load/)).toBeHidden();

  await setPromo(page, "Off");
  await page.goto(`${earningOrder}/receipt`);
  await expect(page.getByRole("article")).not.toContainText(PROMO);
  await page.goto("/customers");
  await expect(page.getByRole("table")).not.toContainText(PROMO);
  await fillLoads(page, "1");
  await expect(page.locator("form")).not.toContainText(PROMO);

  // The order that used a free load still explains its total.
  await page.goto(freeLoadReceipt);
  await expect(page.getByRole("article")).toContainText("-₱180.00");
  await expect(page.getByRole("article")).not.toContainText(PROMO);
});

test("only people who manage settings can reach the toggle", async ({ page }) => {
  await signIn(page, "CASHIER");
  await page.goto("/settings");
  await expect(page.getByRole("switch")).toBeHidden();
});

test("an admin switches the promo off for one customer", async ({ page, browser }) => {
  await signIn(page, "ADMIN");
  await setPromo(page, "On");
  await fillLoads(page, "1");
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page).toHaveURL(/\/transactions\/c[a-z0-9]+$/);
  const receipt = `${page.url()}/receipt`;
  await page.goto(receipt);
  await expect(page.getByRole("article")).toContainText(PROMO);

  await page.goto("/customers");
  const row = page.getByRole("row", { name: new RegExp(CUSTOMER) });
  await row.getByRole("switch").click();
  await expect(row).toContainText("Off");

  await page.goto(receipt);
  await expect(page.getByRole("article")).not.toContainText(PROMO);
  await fillLoads(page, "1");
  await expect(page.locator("form")).not.toContainText(PROMO);

  // A cashier sees where the customer stands but cannot change it.
  const cashier = await browser.newPage({ baseURL: new URL(page.url()).origin });
  await signIn(cashier, "CASHIER");
  await cashier.goto("/customers");
  const cashierRow = cashier.getByRole("row", { name: new RegExp(CUSTOMER) });
  await expect(cashierRow).toContainText("Off");
  await expect(cashierRow.getByRole("switch")).toBeHidden();
  await cashier.close();

  await setPromo(page, "Off");
});

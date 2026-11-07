import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./constants";
import { createOrder, recordPayment, signIn, statCard } from "./helpers";

test("an admin refunds part of a payment", async ({ page }) => {
  await signIn(page, "ADMIN");
  await createOrder(page, "Refund Case");
  await recordPayment(page);

  await page.getByRole("button", { name: "Refund" }).click();
  await page.getByLabel("Amount").fill("50.00");
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByRole("dialog")).toContainText("Give a reason");
  await page.getByLabel("Reason").fill("Stain was not removed");
  await page.getByRole("button", { name: "Record refund" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(statCard(page, "Kept after refunds")).toContainText("₱250.00");
  await expect(statCard(page, "Balance")).toContainText("₱0.00");
  await expect(page.getByRole("cell", { name: "-₱50.00" })).toBeVisible();
});

test("an owner adds a user who can then sign in, and deactivation locks them out", async ({
  page,
  browser,
}) => {
  await signIn(page, "OWNER");
  await page.goto("/users");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Name").fill("New Cashier");
  await page.getByLabel("Email").fill("new.cashier@e2e.local");
  await page.getByLabel("Role").selectOption("CASHIER");
  await page.getByLabel("Temporary password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("cell", { name: "new.cashier@e2e.local" })).toBeVisible();

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const newUser = await context.newPage();
  await newUser.goto("/login");
  await newUser.getByLabel("Email").fill("new.cashier@e2e.local");
  await newUser.getByLabel("Password").fill(E2E_PASSWORD);
  await newUser.getByRole("button", { name: "Sign in" }).click();
  await expect(newUser).toHaveURL(/dashboard/);

  const row = page.getByRole("row", { name: /new\.cashier/ });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Account is active").uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row).toContainText("Inactive");

  await newUser.goto("/dashboard");
  await expect(newUser).toHaveURL(/login/);
  await context.close();
});

test("settings change the shop name shown across the app", async ({ page }) => {
  await signIn(page, "OWNER");
  await page.goto("/settings");
  await page.getByLabel("Shop name").fill("Renamed Laundry");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByLabel("Shop name")).toHaveValue("Renamed Laundry");
  await expect(page.getByRole("complementary")).toContainText("Renamed Laundry");

  await page.getByLabel("Time zone").fill("Mars/Olympus");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Enter a valid time zone.")).toBeVisible();

  await page.getByLabel("Shop name").fill("Kiara's Laundry Shop");
  await page.getByLabel("Time zone").fill("Asia/Manila");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

test("an expense category can be added and used", async ({ page }) => {
  await signIn(page, "OWNER");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Supplies E2E");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("cell", { name: "Supplies E2E" })).toBeVisible();

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByRole("dialog").locator("#categoryId")).toContainText("Supplies E2E");
});

test("customers can be added, searched, and edited", async ({ page }) => {
  await signIn(page, "CASHIER");
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.getByLabel("Name").fill("Maria Searchable");
  await page.getByLabel("Phone").fill("09171234567");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/customers?q=searchable");
  const row = page.getByRole("row", { name: /Maria Searchable/ });
  await expect(row).toContainText("09171234567");
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Phone").fill("09179999999");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("09179999999");
});

test("the audit log records who changed what, and why", async ({ page }) => {
  await signIn(page, "OWNER");
  await createOrder(page, "Audit Case");
  await page.getByRole("button", { name: "Void" }).click();
  await page.getByLabel("Reason").fill("Audit trail check");
  await page.getByRole("button", { name: "Void order" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/audit-logs?q=Audit+trail+check");
  const row = page.getByRole("row", { name: /transaction\.void/ });
  await expect(row).toContainText("E2E OWNER");
  await expect(row).toContainText("Audit trail check");
  await row.getByText("View").click();
  await expect(row).toContainText("voidReason");
});

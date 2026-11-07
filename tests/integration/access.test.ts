import { beforeEach, describe, expect, it } from "vitest";
import {
  expenseSchema,
  serviceSchema,
  settingsSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation";
import { listAuditLogs } from "@/server/audit";
import { listCustomers, saveExpenseCategory, saveService } from "@/server/catalog";
import { prisma } from "@/server/db";
import { createExpense, listExpenses } from "@/server/expenses";
import { listPayments, recordPayment } from "@/server/payments";
import { getSettings, updateSettings } from "@/server/settings";
import { createTransaction, updateTransaction, voidTransaction } from "@/server/transactions";
import { createUser, listUsers, updateUser } from "@/server/users";
import {
  makeCategory,
  makeService,
  makeTeam,
  orderInput,
  paymentInput,
  resetDatabase,
} from "../support/fixtures";

let team: Awaited<ReturnType<typeof makeTeam>>;

const service = serviceSchema.parse({
  name: "Iron",
  pricingUnit: "PER_PIECE",
  currentPrice: "25",
  isActive: true,
});

const settings = settingsSchema.parse({
  shopName: "Renamed Shop",
  address: "1 Main St",
  contactNumber: "0917",
  receiptFooter: "Thanks",
  receiptPrefix: "RS",
  currency: "PHP",
  timeZone: "Asia/Manila",
});

const newUser = userCreateSchema.parse({
  name: "New Hire",
  email: "New.Hire@Test.Local",
  role: "CASHIER",
  password: "a-long-password",
});

beforeEach(async () => {
  await resetDatabase();
  team = await makeTeam();
});

describe("unauthorized calls are refused by the service layer", () => {
  it("blocks staff from every financial write", async () => {
    const wash = await makeService("Wash", 1000);
    const input = orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: "10" }] });
    const order = await createTransaction(team.cashier, input);
    const category = await makeCategory();
    const expense = expenseSchema.parse({
      categoryId: category.id,
      description: "Soap",
      amount: "10",
      expenseDate: "2026-03-10",
      paymentMethod: "CASH",
    });

    const attempts = [
      createTransaction(team.staff, input),
      updateTransaction(team.staff, order.id, input),
      voidTransaction(team.staff, order.id, "No"),
      recordPayment(team.staff, order.id, paymentInput("1")),
      createExpense(team.staff, expense),
      listExpenses(team.staff, {}),
      listPayments(team.staff, {}),
      listCustomers(team.staff, {}),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow("permission");
  });

  it("blocks a cashier from editing, voiding, and expenses", async () => {
    const wash = await makeService("Wash", 1000);
    const input = orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: "10" }] });
    const order = await createTransaction(team.cashier, input);
    await expect(updateTransaction(team.cashier, order.id, input)).rejects.toThrow("permission");
    await expect(voidTransaction(team.cashier, order.id, "No")).rejects.toThrow("permission");
    await expect(listExpenses(team.cashier, {})).rejects.toThrow("permission");
    await expect(saveService(team.cashier, null, service)).rejects.toThrow("permission");
  });

  it("reserves settings for owner and admin", async () => {
    await expect(updateSettings(team.cashier, settings)).rejects.toThrow("permission");
    await expect(updateSettings(team.admin, settings)).resolves.toBeTruthy();
    expect((await getSettings()).shopName).toBe("Renamed Shop");
  });

  it("reserves users and audit logs for the owner", async () => {
    await expect(listUsers(team.admin)).rejects.toThrow("permission");
    await expect(createUser(team.admin, newUser)).rejects.toThrow("permission");
    await expect(listAuditLogs(team.admin, { page: 1 })).rejects.toThrow("permission");
    await expect(listAuditLogs(team.owner, { page: 1 })).resolves.toBeTruthy();
  });
});

describe("audit log", () => {
  it("records every kind of financial change with its author", async () => {
    const wash = await makeService("Wash", 1000);
    const category = await makeCategory();
    const order = await createTransaction(
      team.cashier,
      orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: "10" }] }),
    );
    const payment = await recordPayment(team.cashier, order.id, paymentInput("10"));
    await createExpense(
      team.admin,
      expenseSchema.parse({
        categoryId: category.id,
        description: "Soap",
        amount: "10",
        expenseDate: "2026-03-10",
        paymentMethod: "CASH",
      }),
    );
    await saveService(team.admin, wash.id, { ...service, name: "Wash" });

    const logs = await prisma.auditLog.findMany();
    const actions = logs.map((log) => log.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "transaction.create",
        "payment.create",
        "expense.create",
        "service.update",
      ]),
    );
    const paymentLog = logs.find((log) => log.entityId === payment.id);
    expect(paymentLog?.userId).toBe(team.cashier.id);
  });

  it("rolls back with the change it describes", async () => {
    const wash = await makeService("Wash", 1000);
    const order = await createTransaction(
      team.cashier,
      orderInput({ items: [{ serviceId: wash.id, quantity: "1", unitPrice: "10" }] }),
    );
    const before = await prisma.auditLog.count();
    await expect(recordPayment(team.cashier, order.id, paymentInput("999"))).rejects.toThrow();
    expect(await prisma.auditLog.count()).toBe(before);
  });
});

describe("user management", () => {
  it("stores email lowercased and never returns the hash", async () => {
    const user = await createUser(team.owner, newUser);
    expect(user.email).toBe("new.hire@test.local");
    expect(Object.keys(user)).not.toContain("passwordHash");
    await expect(createUser(team.owner, newUser)).rejects.toThrow("already exists");
  });

  it("always keeps an active owner", async () => {
    const demote = userUpdateSchema.parse({ name: "owner", role: "ADMIN", isActive: true });
    await expect(updateUser(team.owner, team.owner.id, demote)).rejects.toThrow("active owner");
  });

  it("stops you deactivating yourself", async () => {
    const second = await createUser(team.owner, { ...newUser, role: "OWNER" });
    const deactivate = userUpdateSchema.parse({ name: "owner", role: "OWNER", isActive: false });
    await expect(updateUser(team.owner, team.owner.id, deactivate)).rejects.toThrow("your own");
    await expect(updateUser(team.owner, second.id, deactivate)).resolves.toBeTruthy();
  });
});

describe("categories", () => {
  it("rejects duplicates cleanly", async () => {
    await saveExpenseCategory(team.owner, null, { name: "Water", isActive: true });
    await expect(
      saveExpenseCategory(team.owner, null, { name: "Water", isActive: true }),
    ).rejects.toThrow("already exists");
  });
});

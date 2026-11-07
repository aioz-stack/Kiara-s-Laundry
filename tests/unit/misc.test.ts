import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { can, homePath, PERMISSIONS } from "@/lib/permissions";
import {
  expenseSchema,
  paymentSchema,
  settingsSchema,
  statusUpdateSchema,
  transactionSchema,
} from "@/lib/validation";

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([["a,b", 'say "hi"', "line\nbreak"]])).toBe(
      '"a,b","say ""hi""","line\nbreak"\r\n',
    );
  });

  it("neutralises spreadsheet formulas in text", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@cmd"]])).toBe("'=SUM(A1),'+1,'-1,'@cmd\r\n");
  });

  it("leaves numbers numeric and blanks empty", () => {
    expect(toCsv([[-5, null, undefined, 0]])).toBe("-5,,,0\r\n");
  });
});

describe("permissions", () => {
  it("gives the owner everything", () => {
    expect(PERMISSIONS.every((permission) => can("OWNER", permission))).toBe(true);
  });

  it("reserves users and audit logs for the owner", () => {
    expect(can("ADMIN", "users:manage")).toBe(false);
    expect(can("ADMIN", "audit:view")).toBe(false);
  });

  it("lets a cashier sell and collect but not void or adjust", () => {
    expect(can("CASHIER", "transactions:create")).toBe(true);
    expect(can("CASHIER", "payments:collect")).toBe(true);
    expect(can("CASHIER", "transactions:void")).toBe(false);
    expect(can("CASHIER", "payments:adjust")).toBe(false);
    expect(can("CASHIER", "expenses:view")).toBe(false);
    expect(can("CASHIER", "reports:full")).toBe(false);
  });

  it("limits staff to order status work", () => {
    expect(can("STAFF", "orders:view")).toBe(true);
    expect(can("STAFF", "orders:update-status")).toBe(true);
    expect(can("STAFF", "orders:complete")).toBe(false);
    expect(can("STAFF", "transactions:view")).toBe(false);
    expect(can("STAFF", "dashboard:view")).toBe(false);
  });

  it("sends each role to a page it can open", () => {
    expect(homePath("CASHIER")).toBe("/dashboard");
    expect(homePath("STAFF")).toBe("/transactions");
  });
});

describe("validation", () => {
  const order = {
    items: [{ serviceId: "s", quantity: "1", unitPrice: "10" }],
    discount: "0",
    additionalCharge: "0",
    orderDate: "2026-03-10T10:00",
  };

  it("parses amounts to integers", () => {
    const parsed = transactionSchema.parse({
      ...order,
      items: [{ serviceId: "s", quantity: "3.5", unitPrice: "65.00" }],
      discount: "10.50",
    });
    expect(parsed.items[0]).toEqual({ serviceId: "s", quantity: 3500, unitPrice: 6500 });
    expect(parsed.discount).toBe(1050);
  });

  it("requires at least one item", () => {
    expect(transactionSchema.safeParse({ ...order, items: [] }).success).toBe(false);
  });

  it("rejects negative and zero amounts", () => {
    const item = (quantity: string, unitPrice: string) => ({
      ...order,
      items: [{ serviceId: "s", quantity, unitPrice }],
    });
    expect(transactionSchema.safeParse(item("-1", "10")).success).toBe(false);
    expect(transactionSchema.safeParse(item("0", "10")).success).toBe(false);
    expect(transactionSchema.safeParse(item("1", "-10")).success).toBe(false);
    expect(transactionSchema.safeParse({ ...order, discount: "-1" }).success).toBe(false);
  });

  it("requires a payment above zero", () => {
    const payment = { amount: "0", method: "CASH", paidAt: "2026-03-10T10:00" };
    expect(paymentSchema.safeParse(payment).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, amount: "0.01" }).success).toBe(true);
  });

  it("does not allow CANCELLED through a status update", () => {
    expect(statusUpdateSchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(statusUpdateSchema.safeParse({ status: "WASHING" }).success).toBe(true);
  });

  it("only accepts http(s) attachment links", () => {
    const expense = {
      categoryId: "c",
      description: "Soap",
      amount: "100",
      expenseDate: "2026-03-10",
      paymentMethod: "CASH",
    };
    const withUrl = (attachmentUrl: string) =>
      expenseSchema.safeParse({ ...expense, attachmentUrl }).success;
    expect(withUrl("https://example.com/receipt.jpg")).toBe(true);
    expect(withUrl("")).toBe(true);
    expect(withUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects an unknown time zone in settings", () => {
    const settings = {
      shopName: "Shop",
      address: "",
      contactNumber: "",
      receiptFooter: "",
      receiptPrefix: "KL",
      currency: "PHP",
      timeZone: "Mars/Olympus",
    };
    expect(settingsSchema.safeParse(settings).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, timeZone: "Asia/Manila" }).success).toBe(true);
  });
});

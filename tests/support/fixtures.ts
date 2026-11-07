import type { Role } from "@/generated/prisma/enums";
import type { TransactionFormValues, PaymentFormValues } from "@/lib/validation";
import { paymentSchema, transactionSchema } from "@/lib/validation";
import type { Actor } from "@/server/access";
import { prisma } from "@/server/db";

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "PasswordResetToken", "AuditLog", "Payment", "TransactionItem", "LaundryTransaction", "Expense",
      "ExpenseCategory", "Service", "Customer", "User", "ReceiptCounter", "ShopSettings" CASCADE`);
}

export async function makeUser(role: Role, name: string = role.toLowerCase()): Promise<Actor> {
  const user = await prisma.user.create({
    data: { name, email: `${name}@test.local`, role, passwordHash: "unused" },
  });
  return { id: user.id, name: user.name, role: user.role };
}

export async function makeTeam() {
  return {
    owner: await makeUser("OWNER"),
    admin: await makeUser("ADMIN"),
    cashier: await makeUser("CASHIER"),
    staff: await makeUser("STAFF"),
  };
}

export async function makeService(name: string, priceCents: number) {
  return prisma.service.create({
    data: { name, pricingUnit: "PER_KG", currentPriceCents: priceCents },
  });
}

export async function makeCategory(name = "Rent") {
  return prisma.expenseCategory.create({ data: { name } });
}

export function orderInput(
  values: Partial<TransactionFormValues> & Pick<TransactionFormValues, "items">,
) {
  return transactionSchema.parse({
    discount: "0",
    additionalCharge: "0",
    orderDate: "2026-03-10T10:00",
    ...values,
  });
}

export function paymentInput(amount: string, values: Partial<PaymentFormValues> = {}) {
  return paymentSchema.parse({
    amount,
    method: "CASH",
    paidAt: "2026-03-10T11:00",
    ...values,
  });
}

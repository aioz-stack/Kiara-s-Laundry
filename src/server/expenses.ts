import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isValidYmd, ymdToDateOnly } from "@/lib/dates";
import type { ExpenseInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { financialTransaction } from "@/server/transaction-support";

const PAGE_SIZE = 25;

const SORT_FIELDS = {
  expenseDate: "expenseDate",
  amountCents: "amountCents",
  description: "description",
} as const;

export type ExpenseFilters = {
  q?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
};

export function buildExpenseWhere(filters: ExpenseFilters): Prisma.ExpenseWhereInput {
  const expenseDate: Prisma.DateTimeFilter = {};
  if (filters.from && isValidYmd(filters.from)) expenseDate.gte = ymdToDateOnly(filters.from);
  if (filters.to && isValidYmd(filters.to)) expenseDate.lte = ymdToDateOnly(filters.to);
  return {
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(Object.keys(expenseDate).length ? { expenseDate } : {}),
    ...(filters.q
      ? {
          OR: [
            { description: { contains: filters.q, mode: "insensitive" } },
            { payee: { contains: filters.q, mode: "insensitive" } },
            { referenceNumber: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function expenseOrderBy(filters: ExpenseFilters): Prisma.ExpenseOrderByWithRelationInput[] {
  const field = SORT_FIELDS[filters.sort as keyof typeof SORT_FIELDS] ?? "expenseDate";
  return [{ [field]: filters.direction ?? "desc" }, { id: "desc" }];
}

export async function listExpenses(actor: Actor, filters: ExpenseFilters) {
  assertCan(actor, "expenses:view");
  const where = buildExpenseWhere(filters);
  const page = filters.page ?? 1;
  const [rows, total, sum] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: expenseOrderBy(filters),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where: { AND: [where, { voidedAt: null }] },
      _sum: { amountCents: true },
    }),
  ]);
  return { rows, total, pageSize: PAGE_SIZE, totalCents: sum._sum.amountCents ?? 0 };
}

async function assertCategoryUsable(
  tx: Prisma.TransactionClient,
  categoryId: string,
  currentCategoryId?: string,
) {
  const category = await tx.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw new NotFoundError("The category");
  if (!category.isActive && category.id !== currentCategoryId) {
    throw new DomainError(`${category.name} is no longer in use.`);
  }
}

function toRow(input: ExpenseInput) {
  return {
    categoryId: input.categoryId,
    description: input.description,
    amountCents: input.amount,
    expenseDate: ymdToDateOnly(input.expenseDate),
    paymentMethod: input.paymentMethod,
    payee: input.payee,
    referenceNumber: input.referenceNumber,
    notes: input.notes,
    attachmentUrl: input.attachmentUrl,
  };
}

export async function createExpense(actor: Actor, input: ExpenseInput) {
  assertCan(actor, "expenses:manage");
  return financialTransaction(async (tx) => {
    await assertCategoryUsable(tx, input.categoryId);
    const expense = await tx.expense.create({
      data: { ...toRow(input), createdById: actor.id },
    });
    await writeAudit(tx, actor, {
      action: "expense.create",
      entityType: "Expense",
      entityId: expense.id,
      after: expense,
    });
    return expense;
  });
}

async function findEditable(tx: Prisma.TransactionClient, id: string) {
  const expense = await tx.expense.findUnique({ where: { id } });
  if (!expense) throw new NotFoundError("The expense");
  if (expense.voidedAt) throw new DomainError("This expense has been voided.");
  return expense;
}

export async function updateExpense(actor: Actor, id: string, input: ExpenseInput) {
  assertCan(actor, "expenses:manage");
  return financialTransaction(async (tx) => {
    const before = await findEditable(tx, id);
    await assertCategoryUsable(tx, input.categoryId, before.categoryId);
    const after = await tx.expense.update({ where: { id }, data: toRow(input) });
    await writeAudit(tx, actor, {
      action: "expense.update",
      entityType: "Expense",
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

export async function voidExpense(actor: Actor, id: string, reason: string) {
  assertCan(actor, "expenses:manage");
  return financialTransaction(async (tx) => {
    const before = await findEditable(tx, id);
    const after = await tx.expense.update({
      where: { id },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
    });
    await writeAudit(tx, actor, {
      action: "expense.void",
      entityType: "Expense",
      entityId: id,
      before,
      after,
      reason,
    });
    return after;
  });
}

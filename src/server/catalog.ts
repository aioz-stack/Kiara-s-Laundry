import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CategoryInput, CustomerInput, ServiceInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { getPromoStatuses } from "@/server/promo";

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listServices(actor: Actor, options: { activeOnly?: boolean } = {}) {
  assertCan(actor, "services:view");
  return prisma.service.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

function serviceRow(input: ServiceInput) {
  return {
    name: input.name,
    description: input.description,
    pricingUnit: input.pricingUnit,
    currentPriceCents: input.currentPrice,
    promoEligible: input.promoEligible,
    isActive: input.isActive,
  };
}

/** Changing a price never touches past orders: they hold their own snapshot. */
export async function saveService(actor: Actor, id: string | null, input: ServiceInput) {
  assertCan(actor, "services:manage");
  try {
    return await prisma.$transaction(async (tx) => {
      const before = id ? await tx.service.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError("The service");
      const after = id
        ? await tx.service.update({ where: { id }, data: serviceRow(input) })
        : await tx.service.create({ data: serviceRow(input) });
      await writeAudit(tx, actor, {
        action: id ? "service.update" : "service.create",
        entityType: "Service",
        entityId: after.id,
        before: before ?? undefined,
        after,
      });
      return after;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("A service with that name already exists.");
    throw error;
  }
}

export async function listExpenseCategories(actor: Actor, options: { activeOnly?: boolean } = {}) {
  assertCan(actor, "expenses:view");
  return prisma.expenseCategory.findMany({
    where: options.activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function saveExpenseCategory(actor: Actor, id: string | null, input: CategoryInput) {
  assertCan(actor, "settings:manage");
  try {
    return await prisma.$transaction(async (tx) => {
      const before = id ? await tx.expenseCategory.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundError("The category");
      const after = id
        ? await tx.expenseCategory.update({ where: { id }, data: input })
        : await tx.expenseCategory.create({ data: input });
      await writeAudit(tx, actor, {
        action: id ? "category.update" : "category.create",
        entityType: "ExpenseCategory",
        entityId: after.id,
        before: before ?? undefined,
        after,
      });
      return after;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("A category with that name already exists.");
    }
    throw error;
  }
}

const CUSTOMER_PAGE_SIZE = 25;

const CUSTOMER_SORT_FIELDS = { name: "name", createdAt: "createdAt" } as const;

export type CustomerFilters = {
  q?: string;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
};

export async function listCustomers(actor: Actor, filters: CustomerFilters) {
  assertCan(actor, "customers:view");
  const where: Prisma.CustomerWhereInput = filters.q
    ? {
        OR: [
          { name: { contains: filters.q, mode: "insensitive" } },
          { phone: { contains: filters.q } },
          { email: { contains: filters.q, mode: "insensitive" } },
        ],
      }
    : {};
  const field = CUSTOMER_SORT_FIELDS[filters.sort as keyof typeof CUSTOMER_SORT_FIELDS] ?? "name";
  const page = filters.page ?? 1;
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ [field]: filters.direction ?? "asc" }, { id: "asc" }],
      skip: (page - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);
  return { rows, total, pageSize: CUSTOMER_PAGE_SIZE };
}

/** A short list for the order form's customer picker. */
export async function listCustomerOptions(actor: Actor) {
  assertCan(actor, "customers:view");
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const promo = await getPromoStatuses(
    actor,
    customers.map((customer) => customer.id),
  );
  return customers.map((customer) => ({ ...customer, promo: promo.get(customer.id) ?? null }));
}

/** Same rule as the shop-wide switch, and the customer keeps their count. */
export async function setCustomerPromoEnabled(actor: Actor, id: string, enabled: boolean) {
  assertCan(actor, "settings:manage");
  return prisma.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("The customer");
    const after = await tx.customer.update({ where: { id }, data: { promoEnabled: enabled } });
    await writeAudit(tx, actor, {
      action: "customer.promo",
      entityType: "Customer",
      entityId: id,
      before: { promoEnabled: before.promoEnabled },
      after: { promoEnabled: after.promoEnabled },
    });
    return after;
  });
}

export async function saveCustomer(actor: Actor, id: string | null, input: CustomerInput) {
  assertCan(actor, "customers:manage");
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.customer.findUnique({ where: { id } }) : null;
    if (id && !before) throw new NotFoundError("The customer");
    const after = id
      ? await tx.customer.update({ where: { id }, data: input })
      : await tx.customer.create({ data: input });
    await writeAudit(tx, actor, {
      action: id ? "customer.update" : "customer.create",
      entityType: "Customer",
      entityId: after.id,
      before: before ?? undefined,
      after,
    });
    return after;
  });
}

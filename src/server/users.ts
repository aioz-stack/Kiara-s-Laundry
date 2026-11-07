import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/defaults";
import { hashPassword } from "@/lib/password";
import type { FirstOwnerInput, UserCreateInput, UserUpdateInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Anyone who can reach this page while it is open becomes the owner. So only the
 * desktop app turns it on, and only while it listens on this computer alone. A
 * hosted shop makes its owner with `npm run owner:create`.
 */
export async function isFirstRunSetupOpen(db: DbClient = prisma) {
  return process.env.DESKTOP_FIRST_RUN === "1" && (await db.user.count()) === 0;
}

export async function createFirstOwner(input: FirstOwnerInput) {
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if (!(await isFirstRunSetupOpen(tx))) {
      throw new DomainError("This shop already has an owner. Sign in instead.");
    }
    const owner = await tx.user.create({
      data: { name: input.name, email: input.email, role: "OWNER", passwordHash },
      select: PUBLIC_FIELDS,
    });
    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ name: category })),
      skipDuplicates: true,
    });
    await writeAudit(tx, owner, {
      action: "user.create",
      entityType: "User",
      entityId: owner.id,
      after: owner,
    });
    return owner;
  });
}

export async function listUsers(actor: Actor) {
  assertCan(actor, "users:manage");
  return prisma.user.findMany({
    select: PUBLIC_FIELDS,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createUser(actor: Actor, input: UserCreateInput) {
  assertCan(actor, "users:manage");
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, role: input.role, passwordHash },
        select: PUBLIC_FIELDS,
      });
      await writeAudit(tx, actor, {
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        after: user,
      });
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("A user with that email already exists.");
    }
    throw error;
  }
}

export async function updateUser(actor: Actor, id: string, input: UserUpdateInput) {
  assertCan(actor, "users:manage");
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;

  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!before) throw new NotFoundError("The user");

    const losesOwner = before.role === "OWNER" && (input.role !== "OWNER" || !input.isActive);
    if (losesOwner) {
      const owners = await tx.user.count({ where: { role: "OWNER", isActive: true } });
      if (owners <= 1) throw new DomainError("The shop must keep at least one active owner.");
    }
    if (id === actor.id && !input.isActive) {
      throw new DomainError("You cannot deactivate your own account.");
    }

    const after = await tx.user.update({
      where: { id },
      data: {
        name: input.name,
        role: input.role,
        isActive: input.isActive,
        ...(passwordHash ? { passwordHash, failedLogins: 0, lockedUntil: null } : {}),
      },
      select: PUBLIC_FIELDS,
    });
    await writeAudit(tx, actor, {
      action: passwordHash ? "user.update+password" : "user.update",
      entityType: "User",
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { assertCan, type Actor } from "@/server/access";
import { prisma, type DbClient } from "@/server/db";

type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Call with the same transaction client as the change it records. */
export async function writeAudit(db: DbClient, actor: Actor, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeData: toJson(entry.before),
      afterData: toJson(entry.after),
      reason: entry.reason ?? null,
    },
  });
}

const PAGE_SIZE = 30;

export type AuditFilters = {
  q?: string;
  action?: string;
  entityId?: string;
  page: number;
};

export async function listAuditLogs(actor: Actor, filters: AuditFilters) {
  assertCan(actor, "audit:view");
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.q
      ? {
          OR: [
            { action: { contains: filters.q, mode: "insensitive" } },
            { entityType: { contains: filters.q, mode: "insensitive" } },
            { reason: { contains: filters.q, mode: "insensitive" } },
            { user: { name: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);
  return { rows, total, pageSize: PAGE_SIZE, actions: actions.map((row) => row.action) };
}

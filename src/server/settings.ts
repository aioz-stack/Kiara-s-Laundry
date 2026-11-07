import "server-only";
import type { SettingsInput } from "@/lib/validation";
import { assertCan, type Actor } from "@/server/access";
import { writeAudit } from "@/server/audit";
import { prisma, type DbClient } from "@/server/db";

/** Shop configuration, created with defaults on first read. */
export async function getSettings(db: DbClient = prisma) {
  return db.shopSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export type ShopConfig = Awaited<ReturnType<typeof getSettings>>;

export async function updateSettings(actor: Actor, input: SettingsInput) {
  assertCan(actor, "settings:manage");
  return prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await tx.shopSettings.update({ where: { id: 1 }, data: input });
    await writeAudit(tx, actor, {
      action: "settings.update",
      entityType: "ShopSettings",
      entityId: "1",
      before,
      after,
    });
    return after;
  });
}

/** Turning the promo off pauses it: customers keep their count for when it returns. */
export async function setPromoEnabled(actor: Actor, enabled: boolean) {
  assertCan(actor, "settings:manage");
  return prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await tx.shopSettings.update({
      where: { id: 1 },
      data: { promoEnabled: enabled },
    });
    await writeAudit(tx, actor, {
      action: "settings.promo",
      entityType: "ShopSettings",
      entityId: "1",
      before: { promoEnabled: before.promoEnabled },
      after: { promoEnabled: after.promoEnabled },
    });
    return after;
  });
}

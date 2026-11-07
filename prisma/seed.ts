/**
 * Demo data for local development. Everything here is fictional and labelled
 * "[DEMO]". The seed refuses to run in production, and refuses to run twice.
 *
 * Starting data that every install needs (default expense categories) is added
 * by scripts/create-owner.ts, not here.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type PaymentMethod, type Role } from "../src/generated/prisma/client";
import { DEFAULT_EXPENSE_CATEGORIES } from "../src/lib/defaults";
import { hashPassword } from "../src/lib/password";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEMO_PRICE = "[DEMO] Sample price";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo seed must not run in production.");
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error("Set SEED_DEMO_PASSWORD in .env (at least 10 characters).");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  if ((await prisma.user.count()) > 0) {
    console.log("The database already has users. Nothing was seeded.");
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await hashPassword(password);
  const people: { name: string; email: string; role: Role }[] = [
    { name: "[DEMO] Olivia Owner", email: "owner@demo.local", role: "OWNER" },
    { name: "[DEMO] Adrian Admin", email: "admin@demo.local", role: "ADMIN" },
    { name: "[DEMO] Carla Cashier", email: "cashier@demo.local", role: "CASHIER" },
    { name: "[DEMO] Sam Staff", email: "staff@demo.local", role: "STAFF" },
  ];
  const [owner, , cashier] = await Promise.all(
    people.map((person) => prisma.user.create({ data: { ...person, passwordHash } })),
  );
  if (!owner || !cashier) throw new Error("Demo users were not created.");

  await prisma.shopSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      address: "[DEMO] 123 Sample Street, Quezon City",
      contactNumber: "[DEMO] 0917 000 0000",
    },
  });

  const wash = await prisma.service.create({
    data: {
      name: "Wash & Fold",
      description: DEMO_PRICE,
      pricingUnit: "PER_KG",
      currentPriceCents: 6500,
    },
  });
  const dry = await prisma.service.create({
    data: {
      name: "Dry Clean",
      description: DEMO_PRICE,
      pricingUnit: "PER_PIECE",
      currentPriceCents: 18000,
    },
  });
  const press = await prisma.service.create({
    data: {
      name: "Press Only",
      description: DEMO_PRICE,
      pricingUnit: "PER_PIECE",
      currentPriceCents: 3500,
    },
  });
  const comforter = await prisma.service.create({
    data: {
      name: "Comforter",
      description: DEMO_PRICE,
      pricingUnit: "PER_LOAD",
      currentPriceCents: 35000,
    },
  });
  await prisma.service.createMany({
    data: [
      { name: "Regular Per Load", currentPriceCents: 18000 },
      { name: "VIP Per Load", currentPriceCents: 16500 },
    ].map((service) => ({
      ...service,
      description: DEMO_PRICE,
      pricingUnit: "PER_LOAD",
      promoEligible: true,
    })),
  });

  const categories = await Promise.all(
    DEFAULT_EXPENSE_CATEGORIES.map((name) => prisma.expenseCategory.create({ data: { name } })),
  );
  const category = (name: string) => {
    const match = categories.find((item) => item.name === name);
    if (!match) throw new Error(`Missing category ${name}`);
    return match.id;
  };

  const customers = await Promise.all(
    ["Ana Reyes", "Ben Santos", "Cora Dizon", "Dante Lim", "Ella Cruz"].map((name, index) =>
      prisma.customer.create({
        data: { name: `[DEMO] ${name}`, phone: `0917 000 00${index + 10}` },
      }),
    ),
  );

  const now = new Date();
  const methods: PaymentMethod[] = ["CASH", "GCASH", "MAYA", "CASH", "BANK_TRANSFER"];
  const statuses = ["COMPLETED", "COMPLETED", "READY_FOR_PICKUP", "FOLDING", "WASHING"] as const;
  const dayKey = (date: Date) =>
    new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");

  let sequence = 0;
  for (let daysAgo = 34; daysAgo >= 0; daysAgo -= 1) {
    const ordersToday = 2 + (daysAgo % 4);
    for (let order = 0; order < ordersToday; order += 1) {
      sequence += 1;
      const orderDate = new Date(now.getTime() - daysAgo * 86_400_000 - order * 1_800_000);
      const quantityMilli = 2000 + (sequence % 7) * 500;
      const lines = [
        { service: wash, quantityMilli },
        ...(sequence % 3 === 0 ? [{ service: press, quantityMilli: 2000 }] : []),
        ...(sequence % 7 === 0 ? [{ service: dry, quantityMilli: 1000 }] : []),
        ...(sequence % 11 === 0 ? [{ service: comforter, quantityMilli: 1000 }] : []),
      ].map(({ service, quantityMilli: milli }) => ({
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        pricingUnitSnapshot: service.pricingUnit,
        quantityMilli: milli,
        unitPriceCents: service.currentPriceCents,
        lineTotalCents: Math.floor((milli * service.currentPriceCents + 500) / 1000),
      }));
      const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
      const discountCents = sequence % 9 === 0 ? 2000 : 0;
      const totalCents = subtotalCents - discountCents;
      const key = dayKey(orderDate);
      const counter = await prisma.receiptCounter.upsert({
        where: { day: key },
        update: { lastValue: { increment: 1 } },
        create: { day: key, lastValue: 1 },
      });
      const status =
        daysAgo > 3 ? "COMPLETED" : (statuses[sequence % statuses.length] ?? "WASHING");
      const transaction = await prisma.laundryTransaction.create({
        data: {
          receiptNumber: `KL-${key}-${String(counter.lastValue).padStart(4, "0")}`,
          customerId: customers[sequence % customers.length]?.id,
          status,
          subtotalCents,
          discountCents,
          totalCents,
          orderDate,
          completedAt: status === "COMPLETED" ? orderDate : null,
          notes: "[DEMO] Sample order",
          createdById: cashier.id,
          items: { create: lines },
        },
      });

      const paidAt = new Date(orderDate.getTime() + 600_000);
      const paymentCents =
        sequence % 6 === 0 ? 0 : sequence % 5 === 0 ? Math.floor(totalCents / 2) : totalCents;
      if (paymentCents > 0) {
        await prisma.payment.create({
          data: {
            transactionId: transaction.id,
            amountCents: paymentCents,
            method: methods[sequence % methods.length] ?? "CASH",
            paidAt: paidAt > now ? now : paidAt,
            notes: "[DEMO]",
            receivedById: cashier.id,
          },
        });
      }
    }
  }

  const expenses = [
    { name: "Detergent and supplies", label: "Detergent restock", every: 5, cents: 185000 },
    { name: "Electricity", label: "Electric bill", every: 30, cents: 840000 },
    { name: "Water", label: "Water bill", every: 30, cents: 320000 },
    { name: "Rent", label: "Shop rent", every: 30, cents: 1500000 },
    { name: "Maintenance", label: "Washer servicing", every: 17, cents: 95000 },
  ];
  for (const expense of expenses) {
    for (let daysAgo = 2; daysAgo <= 34; daysAgo += expense.every) {
      const expenseDate = new Date(now.getTime() - daysAgo * 86_400_000 + MANILA_OFFSET_MS);
      await prisma.expense.create({
        data: {
          categoryId: category(expense.name),
          description: `[DEMO] ${expense.label}`,
          amountCents: expense.cents,
          expenseDate: new Date(expenseDate.toISOString().slice(0, 10)),
          paymentMethod: "CASH",
          createdById: owner.id,
        },
      });
    }
  }

  console.log(`Seeded ${sequence} demo orders. Sign in as owner@demo.local.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

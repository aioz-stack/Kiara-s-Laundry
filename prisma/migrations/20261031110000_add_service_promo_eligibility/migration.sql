-- Which services earn 10+1 Laundry Promo stamps. Only the shop's Regular and VIP
-- per-load services start marked; anything else is marked on the Services page.
ALTER TABLE "Service" ADD COLUMN "promoEligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TransactionItem" ADD COLUMN "promoEligibleSnapshot" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_promo_needs_per_load" CHECK (NOT "promoEligible" OR "pricingUnit" = 'PER_LOAD');

UPDATE "Service" SET "promoEligible" = true
WHERE "pricingUnit" = 'PER_LOAD' AND upper("name") IN ('PER LOAD', 'VIP PER LOAD');

UPDATE "TransactionItem" i SET "promoEligibleSnapshot" = true
FROM "Service" s
WHERE i."serviceId" = s."id" AND s."promoEligible";

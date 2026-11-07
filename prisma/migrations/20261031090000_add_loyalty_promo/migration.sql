-- The 10+1 Laundry Promo. Off by default, and every existing order starts with
-- promoEarning = false, so past orders never earn free loads retroactively.
ALTER TABLE "ShopSettings" ADD COLUMN "promoEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LaundryTransaction"
  ADD COLUMN "promoDiscountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promoFreeLoad" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "promoEarning" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LaundryTransaction"
  DROP CONSTRAINT "LaundryTransaction_discount_within_subtotal",
  DROP CONSTRAINT "LaundryTransaction_total_consistent",
  ADD CONSTRAINT "LaundryTransaction_promo_discount_valid" CHECK (
    "promoDiscountCents" >= 0 AND ("promoFreeLoad" OR "promoDiscountCents" = 0)
  ),
  ADD CONSTRAINT "LaundryTransaction_discount_within_subtotal" CHECK (
    "discountCents" + "promoDiscountCents" <= "subtotalCents"
  ),
  ADD CONSTRAINT "LaundryTransaction_total_consistent" CHECK (
    "totalCents" = "subtotalCents" - "discountCents" - "promoDiscountCents" + "additionalChargeCents"
  );

-- Per-customer switch for the 10+1 Laundry Promo. Customers start enrolled; the
-- shop-wide switch on ShopSettings still decides whether the promo runs at all.
ALTER TABLE "Customer" ADD COLUMN "promoEnabled" BOOLEAN NOT NULL DEFAULT true;

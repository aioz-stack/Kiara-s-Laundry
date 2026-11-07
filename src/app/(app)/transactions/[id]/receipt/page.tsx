import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { formatInZone } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS, PRICING_UNIT_LABELS } from "@/lib/labels";
import { formatMoney, milliToDecimal } from "@/lib/money";
import { PAID_LOADS_PER_FREE_LOAD, PROMO_NAME } from "@/lib/promo";
import { requirePagePermission } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getPromoStatuses } from "@/server/promo";
import { getSettings } from "@/server/settings";
import { getTransactionDetail } from "@/server/transactions";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await requirePagePermission("transactions:view");
  const settings = await getSettings();
  const order = await getTransactionDetail(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const money = (cents: number) => formatMoney(cents, settings.currency);
  const when = (date: Date) => formatInZone(date, settings.timeZone, "MMM d, yyyy h:mm a");
  const payments = order.payments.filter((payment) => !payment.reversedAt);
  const promoStatuses = await getPromoStatuses(actor, order.customerId ? [order.customerId] : []);
  const promo = order.customerId ? promoStatuses.get(order.customerId) : undefined;

  return (
    <>
      <div className="no-print mb-6 flex gap-2">
        <Button asChild variant="outline">
          <Link href={`/transactions/${order.id}`}>Back to order</Link>
        </Button>
        <PrintButton label="Print receipt" />
      </div>
      <article className="tabular mx-auto max-w-sm rounded-lg border bg-card p-6 text-sm print:max-w-none print:border-0 print:p-0">
        <header className="mb-4 text-center">
          <h1 className="text-lg font-semibold">{settings.shopName}</h1>
          {settings.address ? <p>{settings.address}</p> : null}
          {settings.contactNumber ? <p>{settings.contactNumber}</p> : null}
        </header>

        {order.voidedAt ? (
          <p className="mb-4 border border-destructive p-2 text-center font-semibold text-destructive">
            VOIDED: NOT A VALID RECEIPT
          </p>
        ) : null}

        <dl className="mb-4 flex flex-col gap-0.5">
          <div className="flex justify-between gap-3">
            <dt>Receipt</dt>
            <dd className="font-medium">{order.receiptNumber}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Date</dt>
            <dd>{when(order.orderDate)}</dd>
          </div>
          {order.dueDate ? (
            <div className="flex justify-between gap-3">
              <dt>Due</dt>
              <dd>{when(order.dueDate)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt>Customer</dt>
            <dd>{order.customer?.name ?? "Walk-in"}</dd>
          </div>
        </dl>

        <ul className="flex flex-col gap-2 border-y border-dashed py-3">
          {order.items.map((item) => (
            <li key={item.id}>
              <div className="flex justify-between gap-3">
                <span>{item.serviceNameSnapshot}</span>
                <span>{money(item.lineTotalCents)}</span>
              </div>
              <p className="text-xs text-muted-foreground print:text-black">
                {milliToDecimal(item.quantityMilli)} × {money(item.unitPriceCents)}{" "}
                {PRICING_UNIT_LABELS[item.pricingUnitSnapshot]}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-3 flex flex-col gap-0.5">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{money(order.subtotalCents)}</dd>
          </div>
          {order.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt>Discount</dt>
              <dd>-{money(order.discountCents)}</dd>
            </div>
          ) : null}
          {order.promoFreeLoad ? (
            <div className="flex justify-between">
              <dt>Free load</dt>
              <dd>-{money(order.promoDiscountCents)}</dd>
            </div>
          ) : null}
          {order.additionalChargeCents > 0 ? (
            <div className="flex justify-between">
              <dt>Additional charges</dt>
              <dd>{money(order.additionalChargeCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{money(order.totalCents)}</dd>
          </div>
        </dl>

        {payments.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-0.5 border-t border-dashed pt-3">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-3">
                <span>
                  {payment.type === "REFUND" ? "Refund" : PAYMENT_METHOD_LABELS[payment.method]}
                </span>
                <span>
                  {payment.type === "REFUND" ? "-" : ""}
                  {money(payment.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex justify-between border-t border-dashed pt-3 font-semibold">
          <span>Balance</span>
          <span>{money(order.balanceCents)}</span>
        </div>

        {promo && !order.voidedAt ? (
          <p className="mt-3 border-t border-dashed pt-3 text-center text-xs">
            {PROMO_NAME}: {promo.progress} of {PAID_LOADS_PER_FREE_LOAD} stamps
            {promo.freeLoadsAvailable > 0
              ? `, ${promo.freeLoadsAvailable} free ${promo.freeLoadsAvailable === 1 ? "load" : "loads"} available`
              : ""}
          </p>
        ) : null}

        {settings.receiptFooter ? (
          <p className="mt-6 text-center text-xs whitespace-pre-wrap">{settings.receiptFooter}</p>
        ) : null}
      </article>
    </>
  );
}

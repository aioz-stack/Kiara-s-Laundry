import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerPromoToggle } from "@/components/forms/customer-promo-toggle";
import { PaymentDialog, RefundDialog } from "@/components/forms/payment-dialogs";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { StatusControl } from "@/components/forms/status-control";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { CustomerPromoState } from "@/components/promo-progress";
import { StatCard } from "@/components/stat-card";
import { OrderStatusBadge, PaymentStateBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInZone, utcToLocalInput } from "@/lib/dates";
import { FINANCIAL_TERMS, PAYMENT_METHOD_LABELS, PRICING_UNIT_LABELS } from "@/lib/labels";
import { centsToDecimal, formatMoney, milliToDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PROMO_NAME } from "@/lib/promo";
import { reversePaymentAction, voidTransactionAction } from "@/server/actions";
import type { Actor } from "@/server/access";
import { requirePagePermission } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getPromoStatuses } from "@/server/promo";
import { getSettings } from "@/server/settings";
import { getOrderDetail, getTransactionDetail } from "@/server/transactions";

export const metadata = { title: "Order" };

export default async function TransactionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await requirePagePermission("orders:view");
  return can(actor.role, "transactions:view") ? (
    <FullView id={id} actor={actor} />
  ) : (
    <OperationsView id={id} actor={actor} />
  );
}

async function loadOrNotFound<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

async function OperationsView({ id, actor }: { id: string; actor: Actor }) {
  const { timeZone } = await getSettings();
  const order = await loadOrNotFound(() => getOrderDetail(actor, id));
  const when = (date: Date) => formatInZone(date, timeZone, "MMM d, yyyy h:mm a");
  return (
    <>
      <PageHeader
        title={order.receiptNumber}
        description={`${order.customer?.name ?? "Walk-in"} · ${when(order.orderDate)}`}
        actions={
          order.voidedAt ? undefined : (
            <StatusControl transactionId={order.id} status={order.status} canComplete={false} />
          )
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Items <OrderStatusBadge status={order.status} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.serviceNameSnapshot}</span>
                <span className="tabular text-muted-foreground">
                  {milliToDecimal(item.quantityMilli)}{" "}
                  {PRICING_UNIT_LABELS[item.pricingUnitSnapshot]}
                </span>
              </li>
            ))}
          </ul>
          {order.dueDate ? (
            <p className="mt-4 text-sm text-muted-foreground">Due {when(order.dueDate)}</p>
          ) : null}
          {order.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{order.notes}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}

async function FullView({ id, actor }: { id: string; actor: Actor }) {
  const { timeZone, currency, promoEnabled } = await getSettings();
  const order = await loadOrNotFound(() => getTransactionDetail(actor, id));
  const money = (cents: number) => formatMoney(cents, currency);
  const when = (date: Date) => formatInZone(date, timeZone, "MMM d, yyyy h:mm a");
  const voided = order.voidedAt !== null;
  const nowLocal = utcToLocalInput(new Date(), timeZone);
  const promoStatuses = await getPromoStatuses(actor, order.customerId ? [order.customerId] : []);
  const promo = order.customerId ? promoStatuses.get(order.customerId) : undefined;

  return (
    <>
      <PageHeader
        title={order.receiptNumber}
        description={`${order.customer?.name ?? "Walk-in"} · ${when(order.orderDate)}`}
        actions={
          <>
            {!voided && can(actor.role, "payments:collect") && order.balanceCents > 0 ? (
              <PaymentDialog
                transactionId={order.id}
                balanceCents={order.balanceCents}
                amountDefault={centsToDecimal(order.balanceCents)}
                nowLocal={nowLocal}
                currency={currency}
              />
            ) : null}
            {!voided && can(actor.role, "payments:adjust") && order.netPaidCents > 0 ? (
              <RefundDialog
                transactionId={order.id}
                netPaidCents={order.netPaidCents}
                nowLocal={nowLocal}
                currency={currency}
              />
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/transactions/${order.id}/receipt`}>Receipt</Link>
            </Button>
            {!voided && can(actor.role, "transactions:edit") ? (
              <Button asChild variant="outline">
                <Link href={`/transactions/${order.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            ) : null}
            {!voided && can(actor.role, "transactions:void") ? (
              <ReasonDialog
                trigger={<Button variant="outline">Void</Button>}
                title={`Void ${order.receiptNumber}?`}
                description="The order leaves sales and balances but stays on record. An order holding payments must be refunded or reversed first."
                confirmLabel="Void order"
                success="Order voided"
                action={voidTransactionAction.bind(null, order.id)}
              />
            ) : null}
          </>
        }
      />

      {voided ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          Voided by {order.voidedBy?.name} on {when(order.voidedAt!)}: {order.voidReason}
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={money(order.totalCents)} />
        <StatCard
          label="Kept after refunds"
          value={money(order.netPaidCents)}
          note={
            order.refundedCents > 0
              ? `${money(order.paidCents)} paid, ${money(order.refundedCents)} refunded`
              : undefined
          }
        />
        <StatCard
          label="Balance"
          value={money(order.balanceCents)}
          term={FINANCIAL_TERMS.outstanding}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.serviceNameSnapshot}</TableCell>
                    <TableCell className="tabular text-right">
                      {milliToDecimal(item.quantityMilli)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {money(item.unitPriceCents)}{" "}
                      <span className="text-xs text-muted-foreground">
                        {PRICING_UNIT_LABELS[item.pricingUnitSnapshot]}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {money(item.lineTotalCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="tabular flex flex-col gap-1 border-t p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{money(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>-{money(order.discountCents)}</dd>
              </div>
              {order.promoFreeLoad ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Free load ({PROMO_NAME})</dt>
                  <dd>-{money(order.promoDiscountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Additional charges</dt>
                <dd>{money(order.additionalChargeCents)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{money(order.totalCents)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            {order.payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">{when(payment.paidAt)}</TableCell>
                      <TableCell>
                        {payment.reversedAt ? (
                          <Badge
                            variant="muted"
                            title={`Reversed by ${payment.reversedBy?.name}: ${payment.reversalReason}`}
                          >
                            Reversed
                          </Badge>
                        ) : payment.type === "REFUND" ? (
                          <Badge variant="warning">Refund</Badge>
                        ) : (
                          <Badge variant="success">Payment</Badge>
                        )}
                      </TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                      <TableCell>{payment.referenceNumber ?? "-"}</TableCell>
                      <TableCell>{payment.receivedBy.name}</TableCell>
                      <TableCell
                        className={`tabular text-right ${payment.reversedAt ? "line-through" : ""}`}
                      >
                        {payment.type === "REFUND" ? "-" : ""}
                        {money(payment.amountCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!voided && !payment.reversedAt && can(actor.role, "payments:adjust") ? (
                          <ReasonDialog
                            trigger={
                              <Button variant="ghost" size="sm">
                                Reverse
                              </Button>
                            }
                            title="Reverse this entry?"
                            description="Use this for an entry made in error. It stays on record but no longer counts in any total."
                            confirmLabel="Reverse entry"
                            success="Entry reversed"
                            action={reversePaymentAction.bind(null, payment.id)}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <OrderStatusBadge status={order.status} />
                <PaymentStateBadge
                  balanceCents={order.balanceCents}
                  paidCents={order.paidCents}
                  voided={voided}
                />
              </div>
              {!voided && can(actor.role, "orders:update-status") ? (
                <StatusControl
                  transactionId={order.id}
                  status={order.status}
                  canComplete={can(actor.role, "orders:complete")}
                />
              ) : null}
              {order.dueDate ? <p>Due {when(order.dueDate)}</p> : null}
              {order.completedAt ? <p>Completed {when(order.completedAt)}</p> : null}
              <p className="text-muted-foreground">Created by {order.createdBy.name}</p>
              {order.updatedBy ? (
                <p className="text-muted-foreground">Last changed by {order.updatedBy.name}</p>
              ) : null}
            </CardContent>
          </Card>
          {order.customer ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{order.customer.name}</p>
                {order.customer.phone ? <p>{order.customer.phone}</p> : null}
                {order.customer.email ? <p>{order.customer.email}</p> : null}
                {promoEnabled ? (
                  <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                    <p className="text-xs text-muted-foreground">{PROMO_NAME}</p>
                    <div className="flex items-center gap-3">
                      {can(actor.role, "settings:manage") ? (
                        <CustomerPromoToggle
                          customerId={order.customer.id}
                          customerName={order.customer.name}
                          enabled={order.customer.promoEnabled}
                        />
                      ) : null}
                      <CustomerPromoState promo={promo} />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          {order.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{order.notes}</CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

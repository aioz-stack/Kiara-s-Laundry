import { notFound, redirect } from "next/navigation";
import { TransactionForm } from "@/components/forms/transaction-form";
import { PageHeader } from "@/components/page-header";
import { utcToLocalInput } from "@/lib/dates";
import { centsToDecimal, milliToDecimal } from "@/lib/money";
import { requirePagePermission } from "@/server/auth";
import { listCustomerOptions, listServices } from "@/server/catalog";
import { NotFoundError } from "@/server/errors";
import { getSettings } from "@/server/settings";
import { getTransactionDetail } from "@/server/transactions";

export const metadata = { title: "Edit order" };

export default async function EditTransactionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const actor = await requirePagePermission("transactions:edit");
  const { timeZone, currency } = await getSettings();
  const order = await getTransactionDetail(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  if (order.voidedAt) redirect(`/transactions/${id}`);

  const [allServices, customers] = await Promise.all([
    listServices(actor),
    listCustomerOptions(actor),
  ]);
  const onOrder = new Set(order.items.map((item) => item.serviceId));
  const services = allServices.filter((service) => service.isActive || onOrder.has(service.id));

  return (
    <>
      <PageHeader
        title={`Edit ${order.receiptNumber}`}
        description="The previous version is kept in the audit log."
      />
      <TransactionForm
        transactionId={order.id}
        services={services}
        customers={customers}
        currency={currency}
        freeLoadHolderId={order.promoFreeLoad ? order.customerId : null}
        defaults={{
          customerId: order.customerId ?? "",
          customerName: order.customer?.name ?? "",
          customerPhone: order.customer?.phone ?? "",
          customerEmail: order.customer?.email ?? "",
          items: order.items.map((item) => ({
            serviceId: item.serviceId ?? "",
            quantity: milliToDecimal(item.quantityMilli),
            unitPrice: centsToDecimal(item.unitPriceCents),
          })),
          discount: centsToDecimal(order.discountCents),
          additionalCharge: centsToDecimal(order.additionalChargeCents),
          redeemFreeLoad: order.promoFreeLoad,
          orderDate: utcToLocalInput(order.orderDate, timeZone),
          dueDate: order.dueDate ? utcToLocalInput(order.dueDate, timeZone) : "",
          notes: order.notes ?? "",
        }}
      />
    </>
  );
}

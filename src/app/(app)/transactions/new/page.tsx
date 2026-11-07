import Link from "next/link";
import { TransactionForm } from "@/components/forms/transaction-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { utcToLocalInput } from "@/lib/dates";
import { centsToDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth";
import { listCustomerOptions, listServices } from "@/server/catalog";
import { getSettings } from "@/server/settings";

export const metadata = { title: "New order" };

export default async function NewTransactionPage() {
  const actor = await requirePagePermission("transactions:create");
  const { timeZone, currency } = await getSettings();
  const [services, customers] = await Promise.all([
    listServices(actor, { activeOnly: true }),
    listCustomerOptions(actor),
  ]);

  const first = services[0];
  if (!first) {
    return (
      <>
        <PageHeader title="New order" />
        <Card>
          <EmptyState
            title="No services to sell yet"
            description="Add at least one service before creating an order."
            action={
              can(actor.role, "services:manage") ? (
                <Button asChild size="sm">
                  <Link href="/services">Go to services</Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New order" description="Totals are recalculated by the server on save." />
      <TransactionForm
        services={services}
        customers={customers}
        currency={currency}
        defaults={{
          customerId: "",
          customerName: "",
          customerPhone: "",
          customerEmail: "",
          items: [
            {
              serviceId: first.id,
              quantity: "1",
              unitPrice: centsToDecimal(first.currentPriceCents),
            },
          ],
          discount: "0.00",
          additionalCharge: "0.00",
          orderDate: utcToLocalInput(new Date(), timeZone),
          dueDate: "",
          notes: "",
        }}
      />
    </>
  );
}

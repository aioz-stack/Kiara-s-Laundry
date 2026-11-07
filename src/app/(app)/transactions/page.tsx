import Link from "next/link";
import { DeniedNotice } from "@/components/denied-notice";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { OrderStatusBadge, PaymentStateBadge } from "@/components/status-badges";
import { FilterBar, Pagination, SortableHead } from "@/components/table-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInZone } from "@/lib/dates";
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { directionParam, enumParam, firstParam, pageParam, type SearchParams } from "@/lib/query";
import { requirePagePermission } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { listOrders, listTransactions } from "@/server/transactions";

export const metadata = { title: "Transactions" };

const PATH = "/transactions";

export default async function TransactionsPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("orders:view");
  const { timeZone, currency } = await getSettings();

  const filters = {
    q: firstParam(params, "q"),
    status: enumParam(params, "status", ORDER_STATUSES),
    from: firstParam(params, "from"),
    to: firstParam(params, "to"),
    sort: firstParam(params, "sort"),
    direction: directionParam(params),
    page: pageParam(params),
  };
  const query = { ...filters, page: String(filters.page) };
  const showAmounts = can(actor.role, "transactions:view");
  const canCreate = can(actor.role, "transactions:create");

  const statusFilter = {
    name: "status",
    label: "Status",
    options: ORDER_STATUSES.map((status) => ({
      value: status,
      label: ORDER_STATUS_LABELS[status],
    })),
  };
  const when = (date: Date) => formatInZone(date, timeZone, "MMM d, yyyy h:mm a");

  const empty = (
    <EmptyState
      title="No orders found"
      description="Try changing the filters, or create a new order."
      action={
        canCreate ? (
          <Button asChild size="sm">
            <Link href="/transactions/new">New order</Link>
          </Button>
        ) : undefined
      }
    />
  );

  const table = showAmounts ? await amountsTable() : await operationsTable();

  return (
    <>
      <DeniedNotice denied={firstParam(params, "denied")} />
      <PageHeader
        title={showAmounts ? "Transactions" : "Orders"}
        description="Dates use the shop time zone."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/transactions/new">New order</Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar
        path={PATH}
        query={query}
        searchPlaceholder="Receipt, customer, or phone"
        selects={[statusFilter]}
        dateLabel="Order date"
      />
      <Card>{table}</Card>
    </>
  );

  async function amountsTable() {
    const { rows, total, pageSize } = await listTransactions(actor, filters);
    if (rows.length === 0) return empty;
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead path={PATH} query={query} field="receiptNumber">
                Receipt
              </SortableHead>
              <SortableHead path={PATH} query={query} field="orderDate">
                Order date
              </SortableHead>
              <TableHead>Customer</TableHead>
              <SortableHead path={PATH} query={query} field="status" defaultDirection="asc">
                Status
              </SortableHead>
              <TableHead>Payment</TableHead>
              <SortableHead path={PATH} query={query} field="totalCents" className="text-right">
                Total
              </SortableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.voidedAt ? "opacity-60" : undefined}>
                <TableCell>
                  <Link
                    href={`/transactions/${row.id}`}
                    className="font-medium whitespace-nowrap text-primary hover:underline"
                  >
                    {row.receiptNumber}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{when(row.orderDate)}</TableCell>
                <TableCell>{row.customer?.name ?? "Walk-in"}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <PaymentStateBadge
                    balanceCents={row.balanceCents}
                    paidCents={row.paidCents}
                    voided={row.voidedAt !== null}
                  />
                </TableCell>
                <TableCell className="tabular text-right">
                  {formatMoney(row.totalCents, currency)}
                </TableCell>
                <TableCell className="tabular text-right">
                  {formatMoney(row.balanceCents, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          path={PATH}
          query={query}
          page={filters.page}
          pageSize={pageSize}
          total={total}
        />
      </>
    );
  }

  async function operationsTable() {
    const { rows, total, pageSize } = await listOrders(actor, filters);
    if (rows.length === 0) return empty;
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead path={PATH} query={query} field="receiptNumber">
                Receipt
              </SortableHead>
              <SortableHead path={PATH} query={query} field="orderDate">
                Order date
              </SortableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due</TableHead>
              <SortableHead path={PATH} query={query} field="status" defaultDirection="asc">
                Status
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/transactions/${row.id}`}
                    className="font-medium whitespace-nowrap text-primary hover:underline"
                  >
                    {row.receiptNumber}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{when(row.orderDate)}</TableCell>
                <TableCell>{row.customer?.name ?? "Walk-in"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.dueDate ? when(row.dueDate) : "-"}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          path={PATH}
          query={query}
          page={filters.page}
          pageSize={pageSize}
          total={total}
        />
      </>
    );
  }
}

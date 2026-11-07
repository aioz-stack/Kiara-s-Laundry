import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FilterBar, Pagination, SortableHead } from "@/components/table-controls";
import { Badge } from "@/components/ui/badge";
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
import { FINANCIAL_TERMS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { directionParam, enumParam, firstParam, pageParam, type SearchParams } from "@/lib/query";
import { requirePagePermission } from "@/server/auth";
import { listPayments } from "@/server/payments";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Payments" };

const PATH = "/payments";

export default async function PaymentsPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("payments:view");
  const { timeZone, currency } = await getSettings();
  const money = (cents: number) => formatMoney(cents, currency);

  const filters = {
    q: firstParam(params, "q"),
    method: enumParam(params, "method", PAYMENT_METHODS),
    type: enumParam(params, "type", ["PAYMENT", "REFUND"] as const),
    from: firstParam(params, "from"),
    to: firstParam(params, "to"),
    sort: firstParam(params, "sort"),
    direction: directionParam(params),
    page: pageParam(params),
  };
  const query = { ...filters, page: String(filters.page) };
  const { rows, total, pageSize, receivedCents, refundedCents } = await listPayments(
    actor,
    filters,
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="To record a payment, open the order. Totals below follow the filters."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Received" value={money(receivedCents)} />
        <StatCard label="Refunded" value={money(refundedCents)} />
        <StatCard
          label="Collected"
          value={money(receivedCents - refundedCents)}
          term={FINANCIAL_TERMS.collected}
        />
      </div>
      <FilterBar
        path={PATH}
        query={query}
        searchPlaceholder="Receipt, customer, or reference"
        dateLabel="Paid"
        selects={[
          {
            name: "method",
            label: "Method",
            options: PAYMENT_METHODS.map((method) => ({
              value: method,
              label: PAYMENT_METHOD_LABELS[method],
            })),
          },
          {
            name: "type",
            label: "Type",
            options: [
              { value: "PAYMENT", label: "Payment" },
              { value: "REFUND", label: "Refund" },
            ],
          },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No payments found" description="Try changing the filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead path={PATH} query={query} field="paidAt">
                    Date
                  </SortableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <SortableHead path={PATH} query={query} field="method" defaultDirection="asc">
                    Method
                  </SortableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>By</TableHead>
                  <SortableHead
                    path={PATH}
                    query={query}
                    field="amountCents"
                    className="text-right"
                  >
                    Amount
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={row.reversedAt ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      {formatInZone(row.paidAt, timeZone, "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/transactions/${row.transaction.id}`}
                        className="font-medium whitespace-nowrap text-primary hover:underline"
                      >
                        {row.transaction.receiptNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{row.transaction.customer?.name ?? "Walk-in"}</TableCell>
                    <TableCell>
                      {row.reversedAt ? (
                        <Badge variant="muted" title={row.reversalReason ?? undefined}>
                          Reversed
                        </Badge>
                      ) : row.type === "REFUND" ? (
                        <Badge variant="warning">Refund</Badge>
                      ) : (
                        <Badge variant="success">Payment</Badge>
                      )}
                    </TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[row.method]}</TableCell>
                    <TableCell>{row.referenceNumber ?? "-"}</TableCell>
                    <TableCell>{row.receivedBy.name}</TableCell>
                    <TableCell
                      className={`tabular text-right ${row.reversedAt ? "line-through" : ""}`}
                    >
                      {row.type === "REFUND" ? "-" : ""}
                      {money(row.amountCents)}
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
        )}
      </Card>
    </>
  );
}

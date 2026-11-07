import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { ReasonDialog } from "@/components/forms/reason-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { FilterBar, Pagination, SortableHead } from "@/components/table-controls";
import { Badge } from "@/components/ui/badge";
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
import { dateOnlyToYmd, todayInZone } from "@/lib/dates";
import { FINANCIAL_TERMS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { centsToDecimal, formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { directionParam, firstParam, pageParam, type SearchParams } from "@/lib/query";
import { voidExpenseAction } from "@/server/actions";
import { requirePagePermission } from "@/server/auth";
import { listExpenseCategories } from "@/server/catalog";
import { listExpenses } from "@/server/expenses";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Expenses" };

const PATH = "/expenses";

export default async function ExpensesPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("expenses:view");
  const { timeZone, currency } = await getSettings();
  const money = (cents: number) => formatMoney(cents, currency);

  const filters = {
    q: firstParam(params, "q"),
    categoryId: firstParam(params, "categoryId"),
    from: firstParam(params, "from"),
    to: firstParam(params, "to"),
    sort: firstParam(params, "sort"),
    direction: directionParam(params),
    page: pageParam(params),
  };
  const query = { ...filters, page: String(filters.page) };
  const [{ rows, total, pageSize, totalCents }, categories] = await Promise.all([
    listExpenses(actor, filters),
    listExpenseCategories(actor),
  ]);
  const canManage = can(actor.role, "expenses:manage");
  const activeCategories = categories.filter((category) => category.isActive);

  return (
    <>
      <PageHeader
        title="Expenses"
        actions={
          canManage ? (
            <ExpenseDialog
              categories={activeCategories}
              trigger={<Button>Record expense</Button>}
              defaults={{
                categoryId: "",
                description: "",
                amount: "",
                expenseDate: todayInZone(timeZone),
                paymentMethod: "CASH",
                payee: "",
                referenceNumber: "",
                notes: "",
                attachmentUrl: "",
              }}
            />
          ) : undefined
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total for these filters"
          value={money(totalCents)}
          term={FINANCIAL_TERMS.expenses}
        />
      </div>
      <FilterBar
        path={PATH}
        query={query}
        searchPlaceholder="Description, payee, or reference"
        dateLabel="Expense date"
        selects={[
          {
            name: "categoryId",
            label: "Category",
            options: categories.map((category) => ({ value: category.id, label: category.name })),
          },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No expenses found" description="Try changing the filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead path={PATH} query={query} field="expenseDate">
                    Date
                  </SortableHead>
                  <SortableHead
                    path={PATH}
                    query={query}
                    field="description"
                    defaultDirection="asc"
                  >
                    Description
                  </SortableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead>Reference</TableHead>
                  <SortableHead
                    path={PATH}
                    query={query}
                    field="amountCents"
                    className="text-right"
                  >
                    Amount
                  </SortableHead>
                  {canManage ? (
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={row.voidedAt ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      {dateOnlyToYmd(row.expenseDate)}
                    </TableCell>
                    <TableCell>
                      {row.description}
                      {row.voidedAt ? (
                        <Badge variant="muted" className="ml-2" title={row.voidReason ?? undefined}>
                          Voided
                        </Badge>
                      ) : null}
                      {row.attachmentUrl ? (
                        <a
                          href={row.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-xs text-primary hover:underline"
                        >
                          Attachment
                        </a>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.category.name}</TableCell>
                    <TableCell>{row.payee ?? "-"}</TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TableCell>
                    <TableCell>{row.referenceNumber ?? "-"}</TableCell>
                    <TableCell
                      className={`tabular text-right ${row.voidedAt ? "line-through" : ""}`}
                    >
                      {money(row.amountCents)}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {row.voidedAt ? null : (
                          <div className="flex justify-end gap-1">
                            <ExpenseDialog
                              expenseId={row.id}
                              categories={categories.filter(
                                (category) => category.isActive || category.id === row.categoryId,
                              )}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                              defaults={{
                                categoryId: row.categoryId,
                                description: row.description,
                                amount: centsToDecimal(row.amountCents),
                                expenseDate: dateOnlyToYmd(row.expenseDate),
                                paymentMethod: row.paymentMethod,
                                payee: row.payee ?? "",
                                referenceNumber: row.referenceNumber ?? "",
                                notes: row.notes ?? "",
                                attachmentUrl: row.attachmentUrl ?? "",
                              }}
                            />
                            <ReasonDialog
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Void
                                </Button>
                              }
                              title="Void this expense?"
                              description="It stays on record but no longer counts in any total."
                              confirmLabel="Void expense"
                              success="Expense voided"
                              action={voidExpenseAction.bind(null, row.id)}
                            />
                          </div>
                        )}
                      </TableCell>
                    ) : null}
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

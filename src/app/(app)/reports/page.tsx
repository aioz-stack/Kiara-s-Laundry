import { Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { StatCard } from "@/components/stat-card";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  defaultGranularity,
  formatInZone,
  isValidYmd,
  periodRange,
  todayInZone,
  type DateRange,
  type PeriodPreset,
} from "@/lib/dates";
import { FINANCIAL_TERMS, PAYMENT_METHOD_LABELS, PRICING_UNIT_LABELS } from "@/lib/labels";
import { formatMoney, milliToDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { firstParam, type SearchParams } from "@/lib/query";
import { requirePagePermission } from "@/server/auth";
import {
  getExpenseTotal,
  getExpensesByCategory,
  getOutstandingBalances,
  getPaymentsByMethod,
  getSalesByService,
  getSalesSummary,
  getTrend,
} from "@/server/reports";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Reports" };

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

function resolveRange(params: SearchParams, preset: PeriodPreset, today: string): DateRange {
  if (preset === "custom") {
    const from = firstParam(params, "from");
    const to = firstParam(params, "to");
    if (from && to && isValidYmd(from) && isValidYmd(to) && from <= to) return { from, to };
    return periodRange("monthly", today);
  }
  const date = firstParam(params, "date");
  return periodRange(preset, date && isValidYmd(date) ? date : today);
}

function ExportLink({ kind, range }: { kind: string; range: DateRange }) {
  return (
    <Button asChild variant="ghost" size="sm" className="no-print">
      <a href={`/api/export/${kind}?from=${range.from}&to=${range.to}`}>
        <Download aria-hidden /> CSV
      </a>
    </Button>
  );
}

function ReportCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      {children}
    </Card>
  );
}

export default async function ReportsPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("reports:daily");
  const settings = await getSettings();
  const { timeZone, currency } = settings;
  const money = (cents: number) => formatMoney(cents, currency);

  const fullAccess = can(actor.role, "reports:full");
  const showExpenses = can(actor.role, "expenses:view");
  const today = todayInZone(timeZone);

  const requested = firstParam(params, "preset") as PeriodPreset | undefined;
  const preset: PeriodPreset =
    fullAccess && PRESETS.some((option) => option.value === requested)
      ? (requested as PeriodPreset)
      : "daily";
  const range = resolveRange(params, preset, today);
  const anchor = firstParam(params, "date") ?? today;
  const granularity = defaultGranularity(range);
  const label = range.from === range.to ? range.from : `${range.from} to ${range.to}`;

  const [summary, expenses, trend, byService, byMethod, byCategory, outstanding] =
    await Promise.all([
      getSalesSummary(actor, range),
      showExpenses ? getExpenseTotal(actor, range) : null,
      range.from === range.to ? null : getTrend(actor, range, granularity),
      getSalesByService(actor, range),
      getPaymentsByMethod(actor, range),
      showExpenses ? getExpensesByCategory(actor, range) : null,
      getOutstandingBalances(actor),
    ]);

  const methodTotal = (pick: (row: (typeof byMethod)[number]) => number) =>
    byMethod.reduce((sum, row) => sum + pick(row), 0);
  const outstandingTotal = outstanding.reduce((sum, row) => sum + row.balanceCents, 0);

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${settings.shopName} · ${label} · ${timeZone} calendar days`}
        actions={<PrintButton label="Print report" />}
      />

      <div className="no-print mb-6 flex flex-col gap-3">
        {fullAccess ? (
          <nav aria-label="Report period" className="flex flex-wrap gap-1">
            {PRESETS.map((option) => (
              <Button
                key={option.value}
                asChild
                size="sm"
                variant={option.value === preset ? "secondary" : "ghost"}
              >
                <Link
                  href={`/reports?preset=${option.value}`}
                  aria-current={option.value === preset ? "true" : undefined}
                >
                  {option.label}
                </Link>
              </Button>
            ))}
          </nav>
        ) : (
          <p className="text-sm text-muted-foreground">Your role can view one day at a time.</p>
        )}
        <form action="/reports" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="preset" value={preset} />
          {preset === "custom" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input id="report-from" type="date" name="from" defaultValue={range.from} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input id="report-to" type="date" name="to" defaultValue={range.to} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-date">
                {preset === "daily" ? "Day" : "Any day in the period"}
              </Label>
              <Input id="report-date" type="date" name="date" defaultValue={anchor} />
            </div>
          )}
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-6">
        <section aria-label="Summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Gross sales"
              value={money(summary.grossSalesCents)}
              term={FINANCIAL_TERMS.grossSales}
              note={`${summary.orderCount} orders · average ${money(summary.averageOrderCents)}`}
            />
            <StatCard
              label="Net sales"
              value={money(summary.netSalesCents)}
              term={FINANCIAL_TERMS.netSales}
              note={`After ${money(summary.refundsOnValidOrdersCents)} in refunds`}
            />
            <StatCard
              label="Collected"
              value={money(summary.collectedCents)}
              term={FINANCIAL_TERMS.collected}
              note={`${money(summary.paymentsReceivedCents)} received, ${money(summary.refundsPaidCents)} refunded`}
            />
            <StatCard
              label="Unpaid on these orders"
              value={money(summary.outstandingForPeriodCents)}
              term={FINANCIAL_TERMS.outstandingPeriod}
            />
            {expenses !== null ? (
              <>
                <StatCard
                  label="Expenses"
                  value={money(expenses)}
                  term={FINANCIAL_TERMS.expenses}
                />
                <StatCard
                  label="Net cash flow"
                  value={money(summary.collectedCents - expenses)}
                  term={FINANCIAL_TERMS.netCashFlow}
                  note="Collected minus expenses. Not profit."
                />
              </>
            ) : null}
          </div>
          <div className="no-print mt-2 flex justify-end">
            <ExportLink kind="summary" range={range} />
          </div>
        </section>

        {trend ? (
          <Card>
            <CardHeader>
              <CardTitle>Income trend</CardTitle>
              <CardDescription>
                Grouped by {granularity}, in {currency}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart rows={trend} granularity={granularity} currency={currency} />
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <ReportCard
            title="Sales by service"
            description="By order date. Line totals, then the order-level adjustments."
            action={<ExportLink kind="sales-by-service" range={range} />}
          >
            {byService.length === 0 ? (
              <EmptyState title="No sales in this period" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byService.map((row) => (
                    <TableRow key={`${row.serviceName}-${row.pricingUnit}`}>
                      <TableCell>{row.serviceName}</TableCell>
                      <TableCell className="tabular text-right">
                        {milliToDecimal(row.quantityMilli)}{" "}
                        <span className="text-xs text-muted-foreground">
                          {PRICING_UNIT_LABELS[row.pricingUnit]}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right">{money(row.salesCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="tabular">
                  <TableRow>
                    <TableCell colSpan={2}>Discounts</TableCell>
                    <TableCell className="text-right">-{money(summary.discountCents)}</TableCell>
                  </TableRow>
                  {summary.promoDiscountCents > 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>Free loads (promo)</TableCell>
                      <TableCell className="text-right">
                        -{money(summary.promoDiscountCents)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableCell colSpan={2}>Additional charges</TableCell>
                    <TableCell className="text-right">
                      {money(summary.additionalChargeCents)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2}>Gross sales</TableCell>
                    <TableCell className="text-right">{money(summary.grossSalesCents)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </ReportCard>

          <ReportCard
            title="Payments by method"
            description="By the date the money moved."
            action={<ExportLink kind="payments-by-method" range={range} />}
          >
            {byMethod.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Refunded</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map((row) => (
                    <TableRow key={row.method}>
                      <TableCell>{PAYMENT_METHOD_LABELS[row.method]}</TableCell>
                      <TableCell className="tabular text-right">
                        {money(row.receivedCents)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {money(row.refundedCents)}
                      </TableCell>
                      <TableCell className="tabular text-right">{money(row.netCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="tabular">
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {money(methodTotal((row) => row.receivedCents))}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(methodTotal((row) => row.refundedCents))}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(methodTotal((row) => row.netCents))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </ReportCard>

          {byCategory ? (
            <ReportCard
              title="Expenses by category"
              description="By expense date."
              action={<ExportLink kind="expenses-by-category" range={range} />}
            >
              {byCategory.length === 0 ? (
                <EmptyState title="No expenses in this period" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCategory.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="tabular text-right">{row.count}</TableCell>
                        <TableCell className="tabular text-right">
                          {money(row.amountCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="tabular">
                    <TableRow>
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">{money(expenses ?? 0)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </ReportCard>
          ) : null}

          <ReportCard
            title="Outstanding balances"
            description="Every open balance today, oldest first. Not limited to this period."
            action={<ExportLink kind="outstanding" range={range} />}
          >
            {outstanding.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order date</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/transactions/${row.id}`}
                          className="font-medium whitespace-nowrap text-primary hover:underline"
                        >
                          {row.receiptNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{row.customerName ?? "Walk-in"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatInZone(row.orderDate, timeZone, "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {money(row.balanceCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="tabular">
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right">{money(outstandingTotal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </ReportCard>
        </div>

        <Card className="no-print">
          <CardHeader>
            <CardTitle>History exports</CardTitle>
            <CardDescription>Every entry in this period, including voided ones.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/transactions?from=${range.from}&to=${range.to}`}>
                <Download aria-hidden /> Transactions
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/payments?from=${range.from}&to=${range.to}`}>
                <Download aria-hidden /> Payments
              </a>
            </Button>
            {showExpenses ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/expenses?from=${range.from}&to=${range.to}`}>
                  <Download aria-hidden /> Expenses
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

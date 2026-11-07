import Link from "next/link";
import { DeniedNotice } from "@/components/denied-notice";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { OrderStatusBadge, PaymentStateBadge } from "@/components/status-badges";
import { FilterBar } from "@/components/table-controls";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dateOnlyToYmd,
  formatInZone,
  isValidYmd,
  shiftYmd,
  todayInZone,
  type DateRange,
  type Granularity,
} from "@/lib/dates";
import { FINANCIAL_TERMS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { firstParam, type SearchParams } from "@/lib/query";
import { requirePagePermission } from "@/server/auth";
import { listExpenses } from "@/server/expenses";
import { getExpenseTotal, getSalesSummary, getTrend } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { listTransactions } from "@/server/transactions";

export const metadata = { title: "Dashboard" };

const TREND_WINDOWS: Record<Granularity, { label: string; days: number }> = {
  day: { label: "Daily", days: 13 },
  week: { label: "Weekly", days: 7 * 12 - 1 },
  month: { label: "Monthly", days: 364 },
};

export default async function DashboardPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("dashboard:view");
  const { timeZone, currency } = await getSettings();
  const money = (cents: number) => formatMoney(cents, currency);

  const today = todayInZone(timeZone);
  const fullAccess = can(actor.role, "reports:full");
  const showExpenses = can(actor.role, "expenses:view");

  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const range: DateRange =
    fullAccess && from && to && isValidYmd(from) && isValidYmd(to) && from <= to
      ? { from, to }
      : { from: today, to: today };
  const isToday = range.from === today && range.to === today;
  const period = isToday ? "Today" : `${range.from} to ${range.to}`;

  const trendParam = firstParam(params, "trend");
  const granularity: Granularity =
    trendParam === "week" || trendParam === "month" ? trendParam : "day";

  const [summary, expenses, recentTransactions, recentExpenses, trend] = await Promise.all([
    getSalesSummary(actor, range),
    showExpenses ? getExpenseTotal(actor, range) : null,
    listTransactions(actor, {}),
    showExpenses ? listExpenses(actor, {}) : null,
    fullAccess
      ? getTrend(
          actor,
          { from: shiftYmd(today, -TREND_WINDOWS[granularity].days), to: today },
          granularity,
        )
      : null,
  ]);

  return (
    <>
      <DeniedNotice denied={firstParam(params, "denied")} />
      <PageHeader
        title="Dashboard"
        description={`${period} · figures use the ${timeZone} calendar day`}
        actions={
          <Button asChild>
            <Link href="/transactions/new">New order</Link>
          </Button>
        }
      />

      {fullAccess ? (
        <FilterBar path="/dashboard" query={{ from: range.from, to: range.to }} />
      ) : null}

      <section aria-label="Sales" className="mb-4">
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sales: orders dated in this period
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gross sales"
            value={money(summary.grossSalesCents)}
            term={FINANCIAL_TERMS.grossSales}
          />
          <StatCard
            label="Transactions"
            value={String(summary.orderCount)}
            term={FINANCIAL_TERMS.transactionCount}
          />
          <StatCard
            label="Average transaction"
            value={money(summary.averageOrderCents)}
            term={FINANCIAL_TERMS.averageTransaction}
          />
          <StatCard
            label="Unpaid on these orders"
            value={money(summary.outstandingForPeriodCents)}
            term={FINANCIAL_TERMS.outstandingPeriod}
            note={`All open balances: ${money(summary.outstandingAllCents)}`}
          />
        </div>
      </section>

      <section aria-label="Cash" className="mb-6">
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Cash: money that moved in this period
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Collected"
            value={money(summary.collectedCents)}
            term={FINANCIAL_TERMS.collected}
            note={
              summary.refundsPaidCents > 0
                ? `After ${money(summary.refundsPaidCents)} in refunds`
                : undefined
            }
          />
          {expenses !== null ? (
            <>
              <StatCard label="Expenses" value={money(expenses)} term={FINANCIAL_TERMS.expenses} />
              <StatCard
                label="Net cash flow"
                value={money(summary.collectedCents - expenses)}
                term={FINANCIAL_TERMS.netCashFlow}
                note="Collected minus expenses. Not profit."
              />
            </>
          ) : null}
        </div>
      </section>

      {trend ? (
        <Card className="mb-6">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Income trend</CardTitle>
              <CardDescription>
                Sales by order date, collections by payment date, in {currency}.
              </CardDescription>
            </div>
            <nav aria-label="Trend period" className="flex gap-1">
              {(Object.keys(TREND_WINDOWS) as Granularity[]).map((key) => (
                <Button
                  key={key}
                  asChild
                  size="sm"
                  variant={key === granularity ? "secondary" : "ghost"}
                >
                  <Link
                    href={`/dashboard?from=${range.from}&to=${range.to}&trend=${key}`}
                    aria-current={key === granularity ? "true" : undefined}
                    scroll={false}
                  >
                    {TREND_WINDOWS[key].label}
                  </Link>
                </Button>
              ))}
            </nav>
          </CardHeader>
          <CardContent>
            <TrendChart rows={trend} granularity={granularity} currency={currency} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          {recentTransactions.rows.length === 0 ? (
            <EmptyState title="No orders yet" description="New orders will show up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.rows.slice(0, 6).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/transactions/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.receiptNumber}
                      </Link>
                    </TableCell>
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
                    <TableCell className="tabular text-right">{money(row.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {recentExpenses ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent expenses</CardTitle>
            </CardHeader>
            {recentExpenses.rows.length === 0 ? (
              <EmptyState title="No expenses yet" description="Recorded expenses appear here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentExpenses.rows.slice(0, 6).map((row) => (
                    <TableRow key={row.id} className={row.voidedAt ? "opacity-60" : undefined}>
                      <TableCell className="whitespace-nowrap">
                        {dateOnlyToYmd(row.expenseDate)}
                      </TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{row.category.name}</TableCell>
                      <TableCell className="tabular text-right">
                        {row.voidedAt ? "Voided" : money(row.amountCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ) : null}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Updated {formatInZone(new Date(), timeZone, "MMM d, yyyy h:mm a")}
      </p>
    </>
  );
}

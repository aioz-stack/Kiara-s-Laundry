import { CustomerDialog } from "@/components/forms/catalog-dialogs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { CustomerPromoToggle } from "@/components/forms/customer-promo-toggle";
import { CustomerPromoState } from "@/components/promo-progress";
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
import { can } from "@/lib/permissions";
import { PROMO_NAME } from "@/lib/promo";
import { directionParam, firstParam, pageParam, type SearchParams } from "@/lib/query";
import { requirePagePermission } from "@/server/auth";
import { listCustomers } from "@/server/catalog";
import { getPromoStatuses } from "@/server/promo";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Customers" };

const PATH = "/customers";

export default async function CustomersPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("customers:view");
  const { timeZone, promoEnabled } = await getSettings();

  const filters = {
    q: firstParam(params, "q"),
    sort: firstParam(params, "sort"),
    direction: directionParam(params),
    page: pageParam(params),
  };
  const query = { ...filters, page: String(filters.page) };
  const { rows, total, pageSize } = await listCustomers(actor, filters);
  const canManage = can(actor.role, "customers:manage");
  const canManagePromo = can(actor.role, "settings:manage");
  const promo = await getPromoStatuses(
    actor,
    rows.map((row) => row.id),
  );

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          canManage ? (
            <CustomerDialog
              trigger={<Button>Add customer</Button>}
              defaults={{ name: "", phone: "", email: "", notes: "" }}
            />
          ) : undefined
        }
      />
      <FilterBar
        path={PATH}
        query={query}
        searchPlaceholder="Name, phone, or email"
        dates={false}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Customers are added when you name them on an order."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead path={PATH} query={query} field="name" defaultDirection="asc">
                    Name
                  </SortableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  {promoEnabled ? <TableHead>{PROMO_NAME}</TableHead> : null}
                  <SortableHead path={PATH} query={query} field="createdAt">
                    Added
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
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.phone ?? "-"}</TableCell>
                    <TableCell>{row.email ?? "-"}</TableCell>
                    <TableCell className="tabular text-right">{row._count.transactions}</TableCell>
                    {promoEnabled ? (
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {canManagePromo ? (
                            <CustomerPromoToggle
                              customerId={row.id}
                              customerName={row.name}
                              enabled={row.promoEnabled}
                            />
                          ) : null}
                          <CustomerPromoState promo={promo.get(row.id)} />
                        </div>
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap">
                      {formatInZone(row.createdAt, timeZone, "MMM d, yyyy")}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <CustomerDialog
                          id={row.id}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                          defaults={{
                            name: row.name,
                            phone: row.phone ?? "",
                            email: row.email ?? "",
                            notes: row.notes ?? "",
                          }}
                        />
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

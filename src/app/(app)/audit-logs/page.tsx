import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FilterBar, Pagination } from "@/components/table-controls";
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
import { firstParam, pageParam, type SearchParams } from "@/lib/query";
import { listAuditLogs } from "@/server/audit";
import { requirePagePermission } from "@/server/auth";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Audit logs" };

const PATH = "/audit-logs";

export default async function AuditLogsPage(props: { searchParams: Promise<SearchParams> }) {
  const params = await props.searchParams;
  const actor = await requirePagePermission("audit:view");
  const { timeZone } = await getSettings();
  const filters = {
    q: firstParam(params, "q"),
    action: firstParam(params, "action"),
    page: pageParam(params),
  };
  const query = { ...filters, page: String(filters.page) };
  const { rows, total, pageSize, actions } = await listAuditLogs(actor, filters);

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every financial and configuration change, newest first."
      />
      <FilterBar
        path={PATH}
        query={query}
        searchPlaceholder="User, record type, or reason"
        dates={false}
        selects={[
          {
            name: "action",
            label: "Action",
            options: actions.map((action) => ({ value: action, label: action })),
          },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No entries found" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatInZone(row.createdAt, timeZone, "MMM d, yyyy h:mm:ss a")}
                    </TableCell>
                    <TableCell>{row.user?.name ?? "Deleted user"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell className="text-xs">{row.entityType}</TableCell>
                    <TableCell>{row.reason ?? "-"}</TableCell>
                    <TableCell>
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">View</summary>
                        <div className="mt-2 grid max-w-xl gap-2 text-xs">
                          {row.beforeData ? (
                            <div>
                              <p className="font-medium">Before</p>
                              <pre className="max-h-48 overflow-auto rounded bg-muted p-2">
                                {JSON.stringify(row.beforeData, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                          {row.afterData ? (
                            <div>
                              <p className="font-medium">After</p>
                              <pre className="max-h-48 overflow-auto rounded bg-muted p-2">
                                {JSON.stringify(row.afterData, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      </details>
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

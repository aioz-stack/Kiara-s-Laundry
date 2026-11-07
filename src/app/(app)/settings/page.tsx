import { CategoryDialog } from "@/components/forms/catalog-dialogs";
import { PromoToggle } from "@/components/forms/promo-toggle";
import { SettingsForm } from "@/components/forms/settings-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { PAID_LOADS_PER_FREE_LOAD, PROMO_NAME } from "@/lib/promo";
import { requirePagePermission } from "@/server/auth";
import { listExpenseCategories } from "@/server/catalog";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requirePagePermission("settings:manage");
  const [settings, categories] = await Promise.all([getSettings(), listExpenseCategories(actor)]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Shop</CardTitle>
            <CardDescription>Shown on the app and on printed receipts.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              defaults={{
                shopName: settings.shopName,
                address: settings.address,
                contactNumber: settings.contactNumber,
                receiptFooter: settings.receiptFooter,
                receiptPrefix: settings.receiptPrefix,
                currency: settings.currency,
                timeZone: settings.timeZone,
              }}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{PROMO_NAME}</CardTitle>
              <CardDescription>
                Customers get 1 stamp per load and 1 free load at {PAID_LOADS_PER_FREE_LOAD} stamps.
                Only services marked on the Services page count, on orders that are completed and
                paid in full.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <PromoToggle enabled={settings.promoEnabled} />
              <p className="text-xs text-muted-foreground">
                Off hides the promo from receipts and stops free loads from being used. Customers
                keep their count for when it comes back on.
              </p>
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Expense categories</CardTitle>
              <CategoryDialog
                trigger={
                  <Button variant="outline" size="sm">
                    Add
                  </Button>
                }
                defaults={{ name: "", isActive: true }}
              />
            </CardHeader>
            {categories.length === 0 ? (
              <EmptyState title="No categories yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>{category.name}</TableCell>
                      <TableCell>
                        <Badge variant={category.isActive ? "success" : "muted"}>
                          {category.isActive ? "Active" : "Archived"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <CategoryDialog
                          id={category.id}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                          defaults={{ name: category.name, isActive: category.isActive }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

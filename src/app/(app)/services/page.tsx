import { ServiceDialog } from "@/components/forms/catalog-dialogs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
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
import { PRICING_UNIT_LABELS } from "@/lib/labels";
import { centsToDecimal, formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth";
import { listServices } from "@/server/catalog";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const actor = await requirePagePermission("services:view");
  const { currency } = await getSettings();
  const services = await listServices(actor);
  const canManage = can(actor.role, "services:manage");

  return (
    <>
      <PageHeader
        title="Services"
        description="Changing a price affects new orders only. Past orders keep what they were charged."
        actions={
          canManage ? (
            <ServiceDialog
              trigger={<Button>Add service</Button>}
              defaults={{
                name: "",
                description: "",
                pricingUnit: "PER_KG",
                currentPrice: "",
                promoEligible: false,
                isActive: true,
              }}
            />
          ) : undefined
        }
      />
      <Card>
        {services.length === 0 ? (
          <EmptyState title="No services yet" description="Add the services the shop sells." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Priced</TableHead>
                <TableHead className="text-right">Current price</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <p className="font-medium">{service.name}</p>
                    {service.description ? (
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{PRICING_UNIT_LABELS[service.pricingUnit]}</TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(service.currentPriceCents, currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={service.isActive ? "success" : "muted"}>
                        {service.isActive ? "Active" : "Archived"}
                      </Badge>
                      {service.promoEligible ? <Badge>10+1 promo</Badge> : null}
                    </div>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <ServiceDialog
                        id={service.id}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                        defaults={{
                          name: service.name,
                          description: service.description ?? "",
                          pricingUnit: service.pricingUnit,
                          currentPrice: centsToDecimal(service.currentPriceCents),
                          promoEligible: service.promoEligible,
                          isActive: service.isActive,
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

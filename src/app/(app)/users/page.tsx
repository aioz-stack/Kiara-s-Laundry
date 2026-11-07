import { EditUserDialog, NewUserDialog } from "@/components/forms/catalog-dialogs";
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
import { ROLE_LABELS } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth";
import { listUsers } from "@/server/users";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePagePermission("users:manage");
  const users = await listUsers(actor);
  return (
    <>
      <PageHeader
        title="Users"
        description="Deactivating a user takes effect immediately."
        actions={<NewUserDialog trigger={<Button>Add user</Button>} />}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "success" : "muted"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <EditUserDialog
                    id={user.id}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                    defaults={{
                      name: user.name,
                      role: user.role,
                      isActive: user.isActive,
                      password: "",
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

import { getTranslations } from "next-intl/server";
import { can, PERMISSIONS, ROLES } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X } from "lucide-react";

export default async function PermissionsSettingsPage() {
  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");
  const tPerm = await getTranslations("permissions");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("permissionMatrix")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[14rem]">{t("permission")}</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">{tRoles(r)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((p) => (
                <TableRow key={p}>
                  <TableCell>
                    <span className="font-medium">{tPerm(p)}</span>
                    <code className="ml-2 text-xs text-muted-foreground">{p}</code>
                  </TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      {can(r, p) ? (
                        <><Check aria-hidden className="mx-auto size-4 text-green-600" /><span className="sr-only">{t("allowed")}</span></>
                      ) : (
                        <><X aria-hidden className="mx-auto size-4 text-muted-foreground/40" /><span className="sr-only">{t("notAllowed")}</span></>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

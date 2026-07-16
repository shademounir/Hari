import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, ChevronRight } from "lucide-react";
import { actorOf, requireUser } from "@/lib/session";
import { isBuiltinRole } from "@/lib/rbac";
import { getRoleDescriptions, getRoleLabels } from "@/lib/rbac-server";
import { listRolesWithUsage } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleRowActions } from "@/components/settings/role-row-actions";

// The settings layout already gates on admin:settings; listRolesWithUsage
// re-checks and returns [] for anyone else (defense in depth).

export default async function RolesSettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const tCommon = await getTranslations("common");

  const tRoles = await getTranslations("roles");
  const [roles, labels, descriptions] = await Promise.all([
    listRolesWithUsage(actorOf(user)),
    getRoleLabels(tRoles),
    getRoleDescriptions(tRoles),
  ]);
  const hasCustom = roles.some((r) => !r.builtIn);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rolesTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rolesDescription")}</p>
        {/* CardHeader is a grid that only splits into [1fr auto] when it contains a
            card-action slot — a plain flex wrapper leaves the button full-width. */}
        <CardAction>
          <ButtonLink href="/settings/roles/new" size="sm">
            <Plus aria-hidden className="size-4" />
            {t("newRole")}
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">{t("roleColumn")}</TableHead>
                <TableHead>{t("permissionsColumn")}</TableHead>
                <TableHead>{t("usersColumn")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{tCommon("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.slug}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/settings/roles/${r.slug}`}
                        className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {labels[r.slug] ?? r.slug}
                      </Link>
                      {r.builtIn ? (
                        <Badge variant="secondary">{t("builtInRole")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("customRole")}</Badge>
                      )}
                      {r.builtIn && !r.usesDefaults && (
                        <Badge variant="outline">{t("customized")}</Badge>
                      )}
                    </div>
                    {descriptions[r.slug] && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{descriptions[r.slug]}</p>
                    )}
                    <code className="text-xs text-muted-foreground">{r.slug}</code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t("permissionCount", { count: r.permissions.length })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t("userCount", { count: r.userCount })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <RoleRowActions
                        slug={r.slug}
                        label={labels[r.slug] ?? r.slug}
                        // Built-ins can't be deleted, and a role with holders can't
                        // either — the FK enforces the latter regardless.
                        deletable={!isBuiltinRole(r.slug) && r.userCount === 0}
                        inUse={r.userCount > 0}
                      />
                      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* An empty state that invites the next action, rather than reporting a void. */}
        {!hasCustom && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("noCustomRoles")}</p>
            <ButtonLink href="/settings/roles/new" variant="outline" size="sm" className="mt-3">
              {t("rolesEmptyAction")}
            </ButtonLink>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

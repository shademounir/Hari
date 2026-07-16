import { Fragment } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, X } from "lucide-react";
import { PERMISSIONS, permissionDomain, type Permission } from "@/lib/rbac";
import { getRbacMatrix, getRoleLabels } from "@/lib/rbac-server";
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

// The whole matrix at a glance, read-only. Editing lives one click away in
// /settings/roles/<slug>, so this page stays a map rather than a control panel —
// its job is "see every role next to every other", which a per-role editor can't do.
//
// It reads the EFFECTIVE matrix (lib/rbac-server), not the code constants, so a
// checkbox ticked in the editor shows up here. It used to render the hardcoded
// arrays, which meant it could disagree with what the app actually enforced.

export default async function PermissionsSettingsPage() {
  const t = await getTranslations("settings");
  const tPerm = await getTranslations("permissions");
  const tRoles = await getTranslations("roles");

  const matrix = await getRbacMatrix();
  const labels = await getRoleLabels(tRoles);

  // Permissions read `domain:action:scope`, so the domain is already in the
  // string — no extra metadata to keep in sync just to group them.
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const domain = permissionDomain(p);
    groups.set(domain, [...(groups.get(domain) ?? []), p]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("permissionMatrix")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <CardAction>
          <ButtonLink href="/settings/roles" variant="outline" size="sm">
            {t("manageRoles")}
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[14rem]">{t("permission")}</TableHead>
                {matrix.roles.map((r) => (
                  <TableHead key={r.slug} className="text-center">
                    <Link
                      href={`/settings/roles/${r.slug}`}
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {labels[r.slug]}
                    </Link>
                    {!r.builtIn && (
                      <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                        {t("customRole")}
                      </Badge>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...groups].map(([domain, permissions]) => (
                // One labelled block per domain, so 26 rows read as 8 ideas.
                <Fragment key={domain}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell
                      colSpan={matrix.roles.length + 1}
                      className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {domain}
                    </TableCell>
                  </TableRow>
                  {permissions.map((p) => (
                    <TableRow key={p}>
                      <TableCell>
                        <span className="font-medium">{tPerm(p)}</span>
                        <code className="ml-2 text-xs text-muted-foreground">{p}</code>
                      </TableCell>
                      {matrix.roles.map((r) => (
                        <TableCell key={r.slug} className="text-center">
                          {r.permissions.includes(p) ? (
                            <>
                              <Check aria-hidden className="mx-auto size-4 text-primary" />
                              <span className="sr-only">{t("allowed")}</span>
                            </>
                          ) : (
                            <>
                              <X aria-hidden className="mx-auto size-4 text-muted-foreground/40" />
                              <span className="sr-only">{t("notAllowed")}</span>
                            </>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

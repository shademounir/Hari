import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { actorOf, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getRbacMatrix, getRoleLabels } from "@/lib/rbac-server";
import { listUsers } from "@/lib/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRowActions } from "@/components/people/user-row-actions";
import { initialsOf } from "@/lib/utils";

// `employee:manage`, not `admin:settings`: managing PEOPLE is HR's job, while
// defining what a role MAY DO is the super admin's. That split is the separation
// of duties — and it only holds because a caller can never assign a role whose
// permissions exceed their own (lib/users `canAssignRole`).

export default async function UsersSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; state?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "employee:manage")) redirect("/");

  const sp = await searchParams;
  const state = sp.state === "active" || sp.state === "inactive" ? sp.state : undefined;

  const t = await getTranslations("users");
  const tSettings = await getTranslations("settings");
  const tCommon = await getTranslations("common");
  const [matrix, labels, users] = await Promise.all([
    getRbacMatrix(),
    getRoleLabels(await getTranslations("roles")),
    listUsers(actorOf(user), { q: sp.q, role: sp.role, state }),
  ]);
  const filtered = Boolean(sp.q || sp.role || state);

  return (
    <Card>
      <CardHeader>
        {/* The section <h1> and description live in the layout; repeating them here
            would say the same thing twice, one line apart. */}
        <CardTitle>{t("roster")}</CardTitle>
        <CardAction>
          <ButtonLink href="/people/new" size="sm">
            <UserPlus aria-hidden className="size-4" />
            {t("invite")}
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plain GET form — filters live in the URL, so the page stays shareable
            and needs no client JS (the kb/admin pattern). */}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="w-full sm:w-64"
          />
          <select
            name="role"
            defaultValue={sp.role ?? ""}
            aria-label={t("role")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">{t("allRoles")}</option>
            {matrix.roles.map((r) => (
              <option key={r.slug} value={r.slug}>
                {labels[r.slug] ?? r.slug}
              </option>
            ))}
          </select>
          <select
            name="state"
            defaultValue={state ?? ""}
            aria-label={t("state")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">{t("allStates")}</option>
            <option value="active">{t("active")}</option>
            <option value="inactive">{t("inactive")}</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            {t("filter")}
          </Button>
        </form>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">{t("name")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("department")}</TableHead>
                <TableHead>{t("state")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{tCommon("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                        <AvatarFallback className="text-xs">{initialsOf(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/people/${u.id}`}
                            className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            {u.name}
                          </Link>
                          {u.isSelf && <Badge variant="outline">{t("you")}</Badge>}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{labels[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.title ? `${u.title} · ${u.department}` : (u.department ?? "—")}
                  </TableCell>
                  <TableCell>
                    {!u.active ? (
                      <Badge variant="outline">{t("inactive")}</Badge>
                    ) : u.pendingInvite ? (
                      // Provisioned but never signed in — the invite is outstanding.
                      <Badge variant="outline">{t("pendingInvite")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("active")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      userId={u.id}
                      name={u.name}
                      active={u.active}
                      isSelf={u.isSelf}
                      manageable={u.manageable}
                      pendingInvite={u.active && u.pendingInvite}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {t("noUsers")}{" "}
                    {filtered && (
                      <Link href="/people" className="text-primary underline">
                        {t("clearFilters")}
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{tSettings("cardRolesDesc")}</p>
      </CardContent>
    </Card>
  );
}

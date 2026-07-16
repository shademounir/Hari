import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actorOf, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getUserDetail, listManagerOptions } from "@/lib/users";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserForm } from "@/components/people/user-form";
import { EMPLOYMENT_TYPES, roleOptionsFor } from "../_shared";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "employee:manage")) redirect("/");

  const { id } = await params;
  const target = await getUserDetail(actorOf(user), id);
  if (!target) notFound();

  const t = await getTranslations("users");
  const [roles, managers] = await Promise.all([
    roleOptionsFor(user),
    listManagerOptions(actorOf(user)),
  ]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{target.name}</CardTitle>
          {target.isSelf && <Badge variant="outline">{t("you")}</Badge>}
          {!target.active ? (
            <Badge variant="outline">{t("inactive")}</Badge>
          ) : target.pendingInvite ? (
            <Badge variant="outline">{t("pendingInvite")}</Badge>
          ) : (
            <Badge variant="secondary">{t("active")}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{target.email}</p>
      </CardHeader>
      <CardContent>
        <UserForm
          values={{
            id: target.id,
            name: target.name,
            email: target.email,
            role: target.role,
            title: target.title ?? "",
            department: target.department ?? "",
            location: target.location ?? "",
            employmentType: target.employmentType ?? "FULL_TIME",
            managerId: target.managerId,
            salary: target.salary,
          }}
          roles={roles}
          managers={managers}
          employmentTypes={EMPLOYMENT_TYPES}
          canSetSalary={can(user, "salary:read:all")}
          isSelf={target.isSelf}
          manageable={target.manageable}
        />
      </CardContent>
    </Card>
  );
}

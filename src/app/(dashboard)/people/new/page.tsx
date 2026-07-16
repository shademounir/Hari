import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actorOf, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listManagerOptions } from "@/lib/users";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserForm } from "@/components/people/user-form";
import { EMPLOYMENT_TYPES, roleOptionsFor } from "../_shared";

export default async function InviteUserPage() {
  const user = await requireUser();
  if (!can(user, "employee:manage")) redirect("/");

  const t = await getTranslations("users");
  const [roles, managers] = await Promise.all([
    roleOptionsFor(user),
    listManagerOptions(actorOf(user)),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inviteTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("inviteDescription")}</p>
      </CardHeader>
      <CardContent>
        <UserForm
          values={{
            name: "",
            email: "",
            role: "EMPLOYEE",
            title: "",
            department: "",
            location: "",
            employmentType: "FULL_TIME",
            managerId: null,
            salary: null,
          }}
          roles={roles}
          managers={managers}
          employmentTypes={EMPLOYMENT_TYPES}
          canSetSalary={can(user, "salary:read:all")}
        />
      </CardContent>
    </Card>
  );
}

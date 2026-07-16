import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleEditor } from "@/components/settings/role-editor";

export default async function NewRolePage() {
  const user = await requireUser();
  // The layout gates this too; re-checked here because this page hands the editor
  // the caller's own permissions, which is what bounds the no-escalation rule.
  if (!can(user, "admin:settings")) redirect("/");
  const t = await getTranslations("settings");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newRole")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rolesDescription")}</p>
      </CardHeader>
      <CardContent>
        {/* A caller can only grant what they hold — the server refuses the rest. */}
        <RoleEditor grantable={[...user.permissions]} defaultsFor={null} />
      </CardContent>
    </Card>
  );
}

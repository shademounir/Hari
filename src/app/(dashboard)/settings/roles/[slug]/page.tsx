import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser, actorOf } from "@/lib/session";
import { can, isBuiltinRole, DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac";
import { getRole } from "@/lib/roles";
import { getRoleDescriptions, getRoleLabels } from "@/lib/rbac-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleEditor } from "@/components/settings/role-editor";

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "admin:settings")) redirect("/");

  const { slug } = await params;
  const role = await getRole(actorOf(user), slug);
  if (!role) notFound();

  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");
  const [labels, descriptions] = await Promise.all([
    getRoleLabels(tRoles),
    getRoleDescriptions(tRoles),
  ]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{labels[role.slug] ?? role.slug}</CardTitle>
          {role.builtIn ? (
            <Badge variant="secondary">{t("builtInRole")}</Badge>
          ) : (
            <Badge variant="outline">{t("customRole")}</Badge>
          )}
          <Badge variant="outline">{t("userCount", { count: role.userCount })}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("rolesDescription")}</p>
      </CardHeader>
      <CardContent>
        <RoleEditor
          role={{
            slug: role.slug,
            // Built-ins show HARI's translated copy (read-only); custom roles show
            // their own, which is user data.
            label: labels[role.slug] ?? role.label,
            description: descriptions[role.slug] ?? null,
            builtIn: role.builtIn,
            usesDefaults: role.usesDefaults,
            permissions: role.permissions,
          }}
          grantable={[...user.permissions]}
          // What "reset to defaults" restores — only a built-in has any.
          defaultsFor={isBuiltinRole(role.slug) ? DEFAULT_ROLE_PERMISSIONS[role.slug] : null}
        />
      </CardContent>
    </Card>
  );
}

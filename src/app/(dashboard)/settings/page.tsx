import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import {
  can,
  PERMISSIONS,
  ROLES,
} from "@/lib/rbac";
import { CHAT_MODELS, DEFAULT_MODEL_ID } from "@/lib/ai/providers";
import { TOOL_CATALOGUE, toolsForRole } from "@/lib/ai/tools";
import { CURRENCIES, TIMEZONES, getOrgSettings } from "@/lib/settings";
import { updateOrgSettings } from "./actions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X } from "lucide-react";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user.role, "admin:settings")) redirect("/"); // belt-and-suspenders

  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");
  const tPerm = await getTranslations("permissions");
  const tSummary = await getTranslations("tools.summary");
  const orgSettings = await getOrgSettings();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="space-y-6 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("localization")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">{t("localizationDescription")}</p>
            <form action={updateOrgSettings} className="flex flex-wrap items-end gap-4">
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">{t("currency")}</span>
                <select
                  name="currency"
                  defaultValue={orgSettings.currency}
                  className="block rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">{t("timezone")}</span>
                <select
                  name="timezone"
                  defaultValue={orgSettings.timezone}
                  className="block rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm">{t("save")}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("permissionMatrix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">{t("permission")}</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r} className="text-center">
                        {tRoles(r)}
                      </TableHead>
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

        <Card>
          <CardHeader>
            <CardTitle>{t("aiToolsByRole")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {t("aiToolsDescription")}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[16rem]">{t("tool")}</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r} className="text-center">
                        {tRoles(r)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TOOL_CATALOGUE.map((tool) => (
                    <TableRow key={tool.name}>
                      <TableCell>
                        <code className="text-xs font-medium">{tool.name}</code>
                        <p className="text-xs text-muted-foreground">{tSummary(tool.name)}</p>
                      </TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          {toolsForRole(r).includes(tool.name) ? (
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

        <Card>
          <CardHeader>
            <CardTitle>{t("modelRegistry")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("modelRegistryDescription")}
            </p>
            <div className="grid gap-2">
              {CHAT_MODELS.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border px-4 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{m.label}</span>
                    <code className="ml-2 text-xs text-muted-foreground">{m.modelId}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{m.provider}</Badge>
                    {m.reasoning && <Badge variant="secondary">{t("reasoning")}</Badge>}
                    {m.id === DEFAULT_MODEL_ID && <Badge>{t("default")}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

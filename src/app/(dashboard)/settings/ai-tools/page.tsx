import { getTranslations } from "next-intl/server";
import { ROLES } from "@/lib/rbac";
import { TOOL_CATALOGUE, toolsForRole } from "@/lib/ai/tools";
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

export default async function AiToolsSettingsPage() {
  const t = await getTranslations("settings");
  const tRoles = await getTranslations("roles");
  const tSummary = await getTranslations("tools.summary");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiToolsByRole")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("aiToolsDescription")}</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">{t("tool")}</TableHead>
                {ROLES.map((r) => (
                  <TableHead key={r} className="text-center">{tRoles(r)}</TableHead>
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
  );
}

import { getTranslations } from "next-intl/server";
import { getRbacMatrix, getRoleLabels, subjectOf } from "@/lib/rbac-server";
import { TOOL_CATALOGUE, toolsForSubject } from "@/lib/ai/tools";
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

  // Driven by the EFFECTIVE matrix: this table answers "what can the assistant do
  // for each role", and revoking a permission in the editor has to move it. It is
  // the same TOOL_CATALOGUE filter buildHrTools applies per turn.
  const matrix = await getRbacMatrix();
  const labels = await getRoleLabels(tRoles);
  const toolsByRole = new Map(matrix.roles.map((r) => [r.slug, new Set(toolsForSubject(subjectOf(r)))]));

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
                {matrix.roles.map((r) => (
                  <TableHead key={r.slug} className="text-center">{labels[r.slug]}</TableHead>
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
                  {matrix.roles.map((r) => (
                    <TableCell key={r.slug} className="text-center">
                      {toolsByRole.get(r.slug)?.has(tool.name) ? (
                        <><Check aria-hidden className="mx-auto size-4 text-primary" /><span className="sr-only">{t("allowed")}</span></>
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

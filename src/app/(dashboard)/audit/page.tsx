import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAuditLog, AUDIT_ACTIONS, asAuditAction } from "@/lib/audit";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditViewLogger } from "./view-logger";

// SCRUM-100 — the centralized audit console. A single place for Admin/HR to
// review the compliance trail (alert triage, leave decisions, offboarding, and
// console access). Server-gated by `alerts:read` — the same boundary that
// guards the trail in lib/audit; a non-privileged request 404s. Metadata only:
// roles, action codes, opaque ids — never names, content, or salary.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "alerts:read")) notFound();

  const { action: raw } = await searchParams;
  const action = asAuditAction(raw); // undefined = all
  const t = await getTranslations("audit");

  const entries = await getAuditLog(
    user,
    action ? { action } : undefined,
    200,
  );

  const active = action ?? "all";

  return (
    <div className="pb-10">
      <PageHeader title={t("title")} description={t("description")} />
      <AuditViewLogger filter={action ?? null} />
      <div className="space-y-4 px-4 pt-6 md:px-8">
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("filterLabel")}>
          <ButtonLink
            href="/audit"
            size="sm"
            variant={active === "all" ? "secondary" : "ghost"}
            aria-current={active === "all" ? "page" : undefined}
          >
            {t("filterAll")}
          </ButtonLink>
          {AUDIT_ACTIONS.map((a) => (
            <ButtonLink
              key={a}
              href={`/audit?action=${a}`}
              size="sm"
              variant={active === a ? "secondary" : "ghost"}
              aria-current={active === a ? "page" : undefined}
            >
              {t(`actions.${a}`)}
            </ButtonLink>
          ))}
        </div>

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTime")}</TableHead>
                  <TableHead>{t("colActor")}</TableHead>
                  <TableHead>{t("colAction")}</TableHead>
                  <TableHead>{t("colTarget")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.actorRole}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{t(`actions.${e.action}`)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.targetType
                        ? `${e.targetType}${e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useTranslations, useFormatter } from "next-intl";
import type { AlertKind, AlertSeverity, AlertStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertRowActions } from "./alert-row-actions";

export type AlertRow = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  detail: string | null;
  subjectName: string | null;
  createdAt: string; // ISO
  acknowledgedByName: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null; // ISO, when resolved
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const SEVERITY_VARIANT: Record<AlertSeverity, BadgeVariant> = {
  INFO: "outline",
  WARNING: "secondary",
  // Base variant; CRITICAL overrides the tint below with a solid red so the
  // label keeps enough contrast (the shared `destructive` badge tint doesn't).
  CRITICAL: "secondary",
};

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  INFO: "",
  WARNING: "",
  CRITICAL: "border-transparent bg-destructive text-white",
};

const STATUS_VARIANT: Record<AlertStatus, BadgeVariant> = {
  OPEN: "secondary",
  ACKNOWLEDGED: "outline",
  RESOLVED: "default",
};

export function AlertsTable({ rows }: { rows: AlertRow[] }) {
  const t = useTranslations("alerts");
  const format = useFormatter();

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  // Small "who / when" line under the status badge, from data we already fetch.
  function auditLine(a: AlertRow): string | null {
    if (a.status === "ACKNOWLEDGED" && a.acknowledgedByName) {
      return t("by", { name: a.acknowledgedByName });
    }
    if (a.status === "RESOLVED" && a.resolvedAt) {
      const when = format.dateTime(new Date(a.resolvedAt), { dateStyle: "medium" });
      return a.resolvedByName ? `${when} · ${t("by", { name: a.resolvedByName })}` : when;
    }
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colSeverity")}</TableHead>
            <TableHead>{t("colAlert")}</TableHead>
            <TableHead>{t("colDetail")}</TableHead>
            <TableHead>{t("colWho")}</TableHead>
            <TableHead>{t("colWhen")}</TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead className="text-right">{t("colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => {
            const audit = auditLine(a);
            return (
              <TableRow key={a.id}>
                <TableCell>
                  <Badge variant={SEVERITY_VARIANT[a.severity]} className={SEVERITY_CLASS[a.severity]}>
                    {t(`severity.${a.severity}`)}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{t(`kind.${a.kind}.title`)}</TableCell>
                <TableCell>
                  {a.detail ? (
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{a.detail}</code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {a.subjectName ?? t("system")}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {format.dateTime(new Date(a.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[a.status]}>{t(`status.${a.status}`)}</Badge>
                  {audit && <p className="mt-1 text-xs text-muted-foreground">{audit}</p>}
                </TableCell>
                <TableCell className="text-right">
                  <AlertRowActions id={a.id} status={a.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

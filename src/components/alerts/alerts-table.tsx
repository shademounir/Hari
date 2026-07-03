"use client";

import { useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { AlertKind, AlertSeverity, AlertStatus } from "@prisma/client";
import { Check, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { acknowledgeAlertAction, resolveAlertAction } from "@/app/(dashboard)/alerts/actions";

export type AlertRow = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  detail: string | null;
  subjectName: string | null;
  createdAt: string; // ISO
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
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;
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
          {rows.map((a) => (
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
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {a.status === "OPEN" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => startTransition(() => acknowledgeAlertAction(a.id))}
                    >
                      <Check className="size-3.5" />
                      <span className="hidden sm:inline">{t("action.acknowledge")}</span>
                    </Button>
                  )}
                  {a.status !== "RESOLVED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => startTransition(() => resolveAlertAction(a.id))}
                    >
                      <CheckCheck className="size-3.5" />
                      <span className="hidden sm:inline">{t("action.resolve")}</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

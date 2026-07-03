"use client";

import { useTranslations, useFormatter } from "next-intl";
import type { AlertKind, AlertSeverity, AlertStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
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

// Severity is the ONLY dimension that carries a filled, colored badge, so it
// stays the page's priority signal. Critical = solid red, Warning = amber,
// Info = quiet outline. (Dark text on amber keeps AA contrast.)
const SEVERITY_VARIANT: Record<AlertSeverity, BadgeVariant> = {
  INFO: "outline",
  WARNING: "secondary", // base variant; class below sets the amber fill
  CRITICAL: "secondary",
};

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  INFO: "",
  WARNING: "border-transparent bg-amber-400 text-amber-950",
  CRITICAL: "border-transparent bg-destructive text-white",
};

// Status is a lightweight dot + label (not a filled badge) so it never competes
// with severity's color. Visual weight follows urgency: Open is the loudest
// (needs action), Resolved recedes (done). Dots are decorative; the text uses
// theme tokens so it stays legible in light and dark.
const STATUS_STYLE: Record<AlertStatus, { dot: string; text: string }> = {
  OPEN: { dot: "bg-amber-500", text: "font-medium text-foreground" },
  ACKNOWLEDGED: { dot: "bg-sky-500", text: "text-foreground" },
  RESOLVED: { dot: "bg-emerald-500", text: "text-muted-foreground" },
};

// Raw enum codes (DISALLOWED_REQUEST, rate_limited) read as jargon; show them as
// plain words. The exact code is still in the AiEvent trace for ops.
const humanizeDetail = (d: string) => d.replace(/_/g, " ").toLowerCase();

export function AlertsTable({ rows }: { rows: AlertRow[] }) {
  const t = useTranslations("alerts");
  const format = useFormatter();

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  // Small "who / when" line under the status, from data we already fetch.
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
            const status = STATUS_STYLE[a.status];
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
                    <span className="text-sm text-muted-foreground">{humanizeDetail(a.detail)}</span>
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
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", status.dot)} aria-hidden />
                    <span className={cn("text-sm", status.text)}>{t(`status.${a.status}`)}</span>
                  </span>
                  {audit && <p className="mt-0.5 pl-4 text-xs text-muted-foreground">{audit}</p>}
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

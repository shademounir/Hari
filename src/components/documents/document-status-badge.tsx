"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GeneratedDocumentStatus } from "@prisma/client";

// Status → badge style. Semantic colors (not the brand accent): amber = waiting on
// HR, emerald = ready/done, destructive = rejected. Labels come from i18n.
const STYLES: Record<GeneratedDocumentStatus, string> = {
  REQUESTED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  VALIDATED: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  GENERATED: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  DOWNLOADED: "bg-muted text-muted-foreground",
  REJECTED: "bg-destructive/10 text-destructive",
};

export function DocumentStatusBadge({ status }: { status: GeneratedDocumentStatus }) {
  const t = useTranslations("documents.status");
  return (
    <Badge className={cn("border-transparent font-medium", STYLES[status])}>{t(status)}</Badge>
  );
}

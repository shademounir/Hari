"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { NotificationItem } from "@/lib/notifications";

const FRESH_MS = 5000; // skip the on-open refetch if we just loaded on mount

// Self-fetching bell: loads role-scoped items on mount (to populate the badge)
// and refetches when the dropdown opens (so it can't go stale). The layout no
// longer computes these, so no leave queries block first paint on any route.
export function Notifications() {
  const router = useRouter();
  const t = useTranslations("topbar");
  const tLeave = useTranslations("leaveType");
  const tAlert = useTranslations("alerts");
  const tDocument = useTranslations("documents");
  const format = useFormatter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState(false);
  const seqRef = useRef(0);
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current; // invalidate any in-flight load
    try {
      const res = await fetch("/api/notifications");
      if (seq !== seqRef.current) return; // superseded by a newer load / unmount
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as { items: NotificationItem[] };
      if (seq !== seqRef.current) return;
      setItems(data.items ?? []);
      setError(false);
      lastLoadRef.current = Date.now();
    } catch {
      if (seq === seqRef.current) setError(true);
    }
  }, []);

  useEffect(() => {
    // Populate the badge on mount. `load` sets state only after the fetch
    // resolves (asynchronously), so this can't cascade; the seqRef guard inside
    // `load` discards any superseded response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const count = items.length;
  const viewAllHref = items[0]?.href ?? "/time-off";

  function titleFor(n: NotificationItem): string {
    if (n.kind === "alert") return tAlert(`kind.${n.alertKind}.title`);
    if (n.kind === "documentReady" || n.kind === "documentPending") {
      return tDocument(`notification.${n.kind}`, { type: tDocument(`type.${n.documentType}`) });
    }
    const type = tLeave(n.leaveType);
    return n.kind === "approval"
      ? t("approvalItem", { name: n.employeeName ?? "", type })
      : t("myPendingItem", { type });
  }

  function descFor(n: NotificationItem): string {
    if (n.kind === "alert") {
      const sev = tAlert(`severity.${n.severity}`);
      return n.detail ? `${sev} · ${n.detail}` : sev;
    }
    if (n.kind === "documentReady" || n.kind === "documentPending") {
      return tDocument(`type.${n.documentType}`);
    }
    return `${fmt(n.startDate)} → ${fmt(n.endDate)}`;
  }

  function fmt(iso: string): string {
    return format.dateTime(new Date(iso), { dateStyle: "medium" });
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && Date.now() - lastLoadRef.current > FRESH_MS) load();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`${t("notifications")}${count ? ` (${count})` : ""}`}
          />
        }
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-card">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold text-foreground">{t("notifications")}</span>
          {count > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {count}
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        {error ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            <p>{t("notificationsError")}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => load()}
              className="mt-1 text-primary"
              aria-label={t("retry")}
            >
              {t("retry")}
            </Button>
          </div>
        ) : count === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("noNotifications")}
          </p>
        ) : (
          <>
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => router.push(n.href)}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className="text-sm font-medium text-foreground">{titleFor(n)}</span>
                <span className="text-xs text-muted-foreground">{descFor(n)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push(viewAllHref)}
              className="justify-center text-sm font-medium text-primary"
            >
              {t("viewAll")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

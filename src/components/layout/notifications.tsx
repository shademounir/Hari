"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export function Notifications({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const t = useTranslations("topbar");
  const count = items.length;
  const viewAllHref = items[0]?.href ?? "/time-off";

  return (
    <DropdownMenu>
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
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card">
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
        {count === 0 ? (
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
                <span className="text-sm font-medium text-foreground">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.description}</span>
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

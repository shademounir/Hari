"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { can, type Role } from "@/lib/rbac";
import { NAV_ITEMS } from "@/lib/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { HariMark } from "@/components/brand/logo";

export type NavUser = { name: string; email: string; role: Role };

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Shared nav body — desktop rail + mobile sheet. `onNavigate` closes the sheet.
export function NavBody({
  user,
  onNavigate,
}: {
  user: NavUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tSettings = useTranslations("settings");
  const tRoles = useTranslations("roles");
  const tTop = useTranslations("topbar");
  const items = NAV_ITEMS.filter((i) => !i.permission || can(user.role, i.permission));
  const inSection = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col glass-navy text-on-navy">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <HariMark className="size-9" />
        <div className="leading-none">
          <Image
            src="/assets/Logo_HARI_Light.webp"
            alt="HARI"
            width={506}
            height={105}
            priority
            className="h-5 w-auto object-contain object-left"
          />
          <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-on-navy-muted">
            {tTop("descriptor")}
          </div>
        </div>
      </div>

      <p className="px-5 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-navy-muted">
        {tTop("workspace", { role: tRoles(user.role) })}
      </p>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label={t("primary")}>
        {items.map((item) => {
          const hasChildren = !!item.children?.length;
          const active =
            item.href === "/"
              ? pathname === "/"
              : hasChildren
                ? pathname === item.href
                : pathname.startsWith(item.href);
          const open = hasChildren && inSection(item.href);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-nav-active text-on-navy shadow-sm shadow-black/20"
                    : "text-on-navy-muted hover:bg-white/10 hover:text-on-navy",
                )}
              >
                <item.icon className="size-[18px]" />
                {t(item.key)}
              </Link>

              {open && (
                <div className="mt-1 space-y-0.5">
                  {item.children!.map((child) => {
                    const childActive = inSection(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "block rounded-md py-1.5 pl-10 pr-3 text-sm transition-colors",
                          childActive
                            ? "bg-white/10 font-medium text-on-navy"
                            : "text-on-navy-muted hover:bg-white/5 hover:text-on-navy",
                        )}
                      >
                        {tSettings(child.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <Avatar className="size-9">
            <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-on-navy">
              {initialsOf(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-on-navy">{user.name}</p>
            <p className="truncate text-xs text-on-navy-muted">{tRoles(user.role)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Desktop sidebar — fixed rail, hidden below `md` (the top bar exposes it on mobile). */
export function Sidebar({ user }: { user: NavUser }) {
  return (
    <aside className="hidden h-dvh w-64 shrink-0 border-r border-white/10 md:block">
      <NavBody user={user} />
    </aside>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRoleLabel } from "@/components/role-labels-provider";
import { Menu, ChevronDown, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NavBody, type NavUser } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { CommandSearch } from "@/components/layout/command-search";
import { Notifications } from "@/components/layout/notifications";
import { NAV_ITEMS, NON_ROUTE_PATHS, SEGMENT_TO_KEY } from "@/lib/nav-items";
import { useBreadcrumbLabels } from "@/components/layout/breadcrumb-labels";
import { logout } from "@/lib/auth-actions";

// Last-resort label for a dynamic segment: only ever shown for a record whose
// page hasn't registered its real name (see `breadcrumb-labels.tsx`). A slug
// can't be reversed into a title, so this stays a plain de-slugify rather than
// guessing at title case — "hr-internal" is "HR Internal", not "Hr Internal".
function humanize(segment: string) {
  const s = decodeURIComponent(segment).replace(/[-_]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A Prisma cuid (opaque record id) has no place in a breadcrumb — e.g. an edit URL
// /kb/admin/documents/<cuid> would otherwise read "…/ Documents / Cmr4x…". Detect it
// so the crumb shows a human label ("Edit") instead of the raw id. Matched to the exact
// cuid shape (`c` + 24 lowercase base-36 chars) so hyphen-less slugs aren't caught.
const OPAQUE_ID = /^c[a-z0-9]{24}$/;

export function Topbar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const roleLabelOf = useRoleLabel();
  const tSettings = useTranslations("settings");
  const labels = useBreadcrumbLabels();
  const [open, setOpen] = useState(false);

  const roleLabel = roleLabelOf(user.role);
  const tProfile = useTranslations("profile");

  // Depth-aware breadcrumb built from the shared nav source: top-level page plus
  // any sub-segments. Each sub-segment takes the best label available, in order:
  // its Settings/nav entry, the real record name a page registered for it, then
  // the humanized slug. No non-navigable role crumb.
  const segments = pathname.split("/").filter(Boolean);
  const topKey = SEGMENT_TO_KEY[segments[0] ?? ""];
  const topItem = topKey ? NAV_ITEMS.find((i) => i.key === topKey) : undefined;

  // A page outside the primary nav — /profile, reached from the account menu
  // rather than the sidebar. It used to fall back to "dashboard", which labelled
  // it as a page it isn't; take its registered label (or the humanized slug) and
  // say what it actually is.
  const topHref = topItem?.href ?? `/${segments[0] ?? ""}`;
  const crumbs: { label: string; href: string; navigable: boolean }[] = [
    {
      label: topKey ? t(topKey) : (labels[topHref] ?? humanize(segments[0] ?? "")),
      href: topItem?.href ?? topHref,
      navigable: true,
    },
  ];
  let acc = topItem?.href ?? topHref;
  for (const seg of segments.slice(1)) {
    acc = `${acc === "/" ? "" : acc}/${seg}`;
    const child = topItem?.children?.find((c) => c.href === acc);
    const childLabel = child
      ? child.ns === "nav"
        ? t(child.key)
        : tSettings(child.key)
      : (labels[acc] ?? (OPAQUE_ID.test(seg) ? t("edit") : humanize(seg)));
    crumbs.push({ label: childLabel, href: acc, navigable: !NON_ROUTE_PATHS.has(acc) });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b glass px-3 md:px-6">
      {/* Mobile: hamburger opens the sidebar nav in a sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t("openNavigation")}
            />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
          <NavBody user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb — must be able to shrink and clip: without min-w-0 + overflow
          hidden the crumb text spills under the action cluster on narrow screens. */}
      <nav aria-label={t("breadcrumb")} className="flex min-w-0 items-center gap-2 overflow-hidden text-sm">
        {/* Home link is redundant on mobile (the hamburger nav has Dashboard); hide it
            so the section name gets the width instead of truncating to "HARI / K…". */}
        <Link
          href="/"
          className="hidden shrink-0 font-semibold text-muted-foreground hover:text-foreground sm:inline"
        >
          HARI
        </Link>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span
              key={c.href}
              className={cn("flex min-w-0 items-center gap-2", i >= 1 && "hidden sm:flex")}
            >
              {/* Drop the leading "/" on mobile too, now that HARI is hidden there. */}
              <span className={cn("text-muted-foreground/50", i === 0 && "hidden sm:inline")}>/</span>
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-foreground">
                  {c.label}
                </span>
              ) : c.navigable ? (
                <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-muted-foreground">{c.label}</span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        <CommandSearch caller={user} />
        <Notifications />
        <ThemeToggle />
        <LanguageSwitcher />

        {/* User / role menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-2" aria-label={t("userMenu")} />
            }
          >
            <span className="size-2 rounded-full bg-primary" />
            <span className="hidden max-w-28 truncate sm:inline">{roleLabel}</span>
            <ChevronDown className="size-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/profile" />}>
              <UserRound className="size-4" /> {tProfile("nav")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <LogOut className="size-4" /> {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

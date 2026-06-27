"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Bot,
  Users,
  CalendarDays,
  Settings,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { can, type Permission, type Role } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { logout } from "@/lib/auth-actions";

type User = { name: string; email: string; role: Role };

type NavItem = {
  href: string;
  label: "dashboard" | "assistant" | "directory" | "timeOff" | "settings";
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission; // hidden unless the role holds it
};

const NAV: NavItem[] = [
  { href: "/", label: "dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "assistant", icon: Bot },
  { href: "/directory", label: "directory", icon: Users },
  { href: "/time-off", label: "timeOff", icon: CalendarDays },
  { href: "/settings", label: "settings", icon: Settings, permission: "admin:settings" },
];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// The nav body, shared by the desktop sidebar and the mobile sheet. `onNavigate`
// lets the mobile sheet close itself when a link is tapped.
function NavBody({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const items = NAV.filter((i) => !i.permission || can(user.role, i.permission));

  return (
    <>
      <div className="flex items-center gap-2 px-5 py-4 font-semibold">
        <Bot className="size-5 text-primary" />
        HARI
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label={t("primary")}>
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <Avatar className="size-8">
            <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <Badge variant="secondary" className="mt-0.5 text-[10px]">
              {tRoles(user.role)}
            </Badge>
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-muted-foreground"
          >
            <LogOut className="size-4" /> {t("signOut")}
          </Button>
        </form>
      </div>
    </>
  );
}

/** Desktop sidebar — fixed rail, hidden below `md`. */
export function Sidebar({ user }: { user: User }) {
  return (
    <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r bg-card md:flex">
      <NavBody user={user} />
    </aside>
  );
}

/** Mobile top bar — the hamburger opens the same nav in a left sheet. Hidden at `md+`. */
export function MobileNav({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <header className="flex h-14 items-center gap-2 border-b bg-card px-3 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("openNavigation")} />}
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
          <div className="flex h-full flex-col">
            <NavBody user={user} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <span className="flex items-center gap-2 font-semibold">
        <Bot className="size-5 text-primary" />
        HARI
      </span>
    </header>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { can, type Role } from "@/lib/rbac";
import { NAV_ITEMS } from "@/lib/nav-items";

// Command palette: click the search box or press ⌘K / Ctrl+K, type to filter the
// pages you can see, ↑/↓ to move, Enter to navigate. Built on the Base UI Dialog
// primitive (focus trap, scroll lock, focus restore, Escape) with a WAI-ARIA
// combobox/listbox for screen readers.
export function CommandSearch({ role }: { role: Role }) {
  const router = useRouter();
  const t = useTranslations("nav");
  const tTop = useTranslations("topbar");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const pages = NAV_ITEMS.filter((p) => !p.permission || can(role, p.permission)).map(
    (p) => ({ href: p.href, icon: p.icon, label: t(p.key) }),
  );
  const results = pages.filter((p) =>
    p.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const activeIdx = results.length ? Math.min(active, results.length - 1) : 0;
  const activeId = results.length ? `cmdk-opt-${activeIdx}` : undefined;

  // Open/close the palette, resetting the query + cursor whenever it opens.
  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      setQuery("");
      setActive(0);
    }
    setOpen(next);
  }, []);

  // Global ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        changeOpen(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, changeOpen]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={tTop("search")}
            className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          />
        }
      >
        <Search className="size-4" />
        <span className="hidden md:inline">{tTop("search")}</span>
        <kbd className="ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:inline">
          ⌘K
        </kbd>
      </DialogTrigger>

      <DialogContent className="p-0">
        <DialogTitle className="sr-only">{tTop("search")}</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            role="combobox"
            aria-expanded
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[activeIdx]) {
                e.preventDefault();
                go(results[activeIdx].href);
              }
            }}
            placeholder={tTop("search")}
            className="h-12 flex-1 rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
        </div>
        <ul id="cmdk-listbox" role="listbox" className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {tTop("noResults")}
            </li>
          ) : (
            results.map((item, i) => (
              <li
                key={item.href}
                id={`cmdk-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                  i === activeIdx
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground",
                )}
              >
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

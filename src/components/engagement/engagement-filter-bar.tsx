"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ListFilter, ChevronDown, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EngagementBand } from "@/lib/engagement/engagement";

const BANDS: EngagementBand[] = ["RED", "ORANGE", "YELLOW", "GREEN"];
const SORTS = ["risk", "scoreDesc", "name", "momentum"] as const;

// Client interaction island for the RSC dashboard. Every control writes to the URL
// (?dept=&band=&manager=&q=&sort=), so the page re-renders server-side with the new
// filter — the table/charts stay Server Components. RBAC scope is enforced upstream
// in getEngagementDashboard; these filters only narrow within what the caller may see.
export function EngagementFilterBar({
  departments,
  managers,
}: {
  departments: string[];
  managers: string[];
}) {
  const t = useTranslations("engagement.filters");
  const tBand = useTranslations("engagement.band");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Any filter change resets pagination to page 1.
  const commit = (next: URLSearchParams) => {
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const setSingle = (key: string, value: string) => {
    const next = new URLSearchParams(Array.from(sp.entries()));
    if (value === "all") next.delete(key);
    else next.set(key, value);
    commit(next);
  };

  const toggleMulti = (key: string, value: string) => {
    const next = new URLSearchParams(Array.from(sp.entries()));
    const existing = next.getAll(key);
    next.delete(key);
    (existing.includes(value) ? existing.filter((v) => v !== value) : [...existing, value]).forEach((v) =>
      next.append(key, v),
    );
    commit(next);
  };

  // Debounced free-text search.
  const [search, setSearch] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((sp.get("q") ?? "") === search) return;
      const next = new URLSearchParams(Array.from(sp.entries()));
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      commit(next);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectedDepts = sp.getAll("dept");
  const selectedBands = sp.getAll("band");
  const manager = sp.get("manager") ?? "all";
  const sort = sp.get("sort") ?? "risk";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ListFilter className="size-3.5" />
        {t("label")}
      </span>

      {/* Search by name */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="h-8 w-48 pl-8"
        />
      </div>

      <MultiSelect
        label={t("department")}
        options={departments.map((d) => ({ value: d, label: d }))}
        selected={selectedDepts}
        onToggle={(v) => toggleMulti("dept", v)}
        allLabel={t("allDepartments")}
        selectedText={(n) => t("selected", { count: n })}
      />

      <MultiSelect
        label={t("band")}
        options={BANDS.map((b) => ({ value: b, label: tBand(b) }))}
        selected={selectedBands}
        onToggle={(v) => toggleMulti("band", v)}
        allLabel={t("allBands")}
        selectedText={(n) => t("selected", { count: n })}
      />

      <Select value={manager} onValueChange={(v) => v && setSingle("manager", v)}>
        <SelectTrigger size="sm" className="w-44" aria-label={t("manager")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allManagers")}</SelectItem>
          {managers.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => v && setSingle("sort", v)}>
        <SelectTrigger size="sm" className="w-44" aria-label={t("sort")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`sort_${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Compact checkbox dropdown backed by a repeatable URL param.
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  allLabel,
  selectedText,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  allLabel: string;
  selectedText: (count: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const summary = selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : selectedText(selected.length);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-8 items-center gap-2 rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
      >
        <span className="max-w-[9rem] truncate">
          {label}: {summary}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 max-h-64 w-52 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            {options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary" : "border-input",
                    )}
                  >
                    {checked && <Check className="size-3 text-primary-foreground" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

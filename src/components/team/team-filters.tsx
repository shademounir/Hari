"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronDown, Filter, Search, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { asLeaveStatus, asLeaveType } from "@/lib/leave";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Option = { value: string; label: string };

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const TYPES = ["VACATION", "SICK", "PERSONAL"] as const;

// Multi-select facet backed by repeatable URL search params (?key=a&key=b).
// Same pattern + classes as directory/filters.tsx so the two dashboards match.
function MultiSelectFilter({
  title,
  paramKey,
  options,
}: {
  title: string;
  paramKey: string;
  options: Option[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("team");
  const selected = searchParams.getAll(paramKey);

  const toggleParam = (value: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    const existing = current.getAll(paramKey);
    current.delete(paramKey);
    const updated = existing.includes(value)
      ? existing.filter((v) => v !== value)
      : [...existing, value];
    updated.forEach((v) => current.append(paramKey, v));
    router.push(current.toString() ? `${pathname}?${current.toString()}` : pathname);
  };

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded-xl border bg-muted/30 p-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50"
      >
        {title} ({selected.length}) <ChevronDown className="size-3" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border bg-card p-2 shadow-xl">
          <Input
            placeholder={t("optionPlaceholder")}
            className="mb-2 h-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filtered.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggleParam(opt.value)}
                  aria-pressed={checked}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm capitalize hover:bg-muted"
                >
                  <span
                    className={`flex size-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary" : "border-input"}`}
                  >
                    {checked && <Check className="size-3 text-primary-foreground" />}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamFilters({ departments }: { departments: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("team");
  const tStatus = useTranslations("leaveStatus");
  const tType = useTranslations("leaveType");
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");

  // Debounced sync of the free-text name search into the URL (?search=…).
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));
      if (searchTerm) current.set("search", searchTerm);
      else current.delete("search");
      if (searchParams.get("search") !== searchTerm) {
        router.push(current.toString() ? `${pathname}?${current.toString()}` : pathname);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchTerm, pathname, router, searchParams]);

  const statusOptions: Option[] = STATUSES.map((value) => ({
    value,
    label: tStatus(asLeaveStatus(value)),
  }));
  const typeOptions: Option[] = TYPES.map((value) => ({
    value,
    label: tType(asLeaveType(value)),
  }));
  const departmentOptions: Option[] = departments.map((value) => ({ value, label: value }));

  return (
    <Collapsible className="w-full rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t("searchPlaceholder")}
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 rounded-xl border-none bg-muted/30 pl-9"
          />
        </div>
        <CollapsibleTrigger className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 transition hover:bg-accent">
          <Filter className="size-4" />
          {t("filters")}
          <ChevronDown className="size-3" />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="border-t px-4 pb-4">
        <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 md:grid-cols-3">
          <MultiSelectFilter title={t("filterStatus")} paramKey="status" options={statusOptions} />
          <MultiSelectFilter title={t("filterType")} paramKey="type" options={typeOptions} />
          <MultiSelectFilter
            title={t("filterDepartment")}
            paramKey="dept"
            options={departmentOptions}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

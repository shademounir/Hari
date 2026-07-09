"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ListFilter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Client island: the ONLY interactive part of the risk map. It writes the filter
// state into the URL (?dept=&band=) so the table stays a Server Component and the
// filtered view is bookmarkable/shareable. Changing a filter resets pagination.
export function RiskMapFilters({ departments }: { departments: string[] }) {
  const t = useTranslations("predictions.riskMap.filters");
  const tBand = useTranslations("predictions.band");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dept = searchParams.get("dept") ?? "all";
  const band = searchParams.get("band") ?? "all";

  const setParam = (key: string, value: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (value === "all") current.delete(key);
    else current.set(key, value);
    current.delete("page"); // any filter change returns to page 1
    const qs = current.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ListFilter className="size-3.5" />
        {t("label")}
      </span>

      <Select value={dept} onValueChange={(v) => v && setParam("dept", v)}>
        <SelectTrigger size="sm" className="w-44" aria-label={t("department")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allDepartments")}</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={band} onValueChange={(v) => v && setParam("band", v)}>
        <SelectTrigger size="sm" className="w-40" aria-label={t("band")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allBands")}</SelectItem>
          <SelectItem value="red">{tBand("red")}</SelectItem>
          <SelectItem value="orange">{tBand("orange")}</SelectItem>
          <SelectItem value="green">{tBand("green")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

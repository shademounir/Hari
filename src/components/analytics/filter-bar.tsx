"use client";

// HARI-122 — global analytics filters (department · period · contract · level).
// Writes the selection into the URL query so the server page re-renders with the
// new filters (and the CSV export links inherit them). Purely additive: an unset
// select falls back to "all".
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const PERIODS = ["month", "quarter", "semester", "year"] as const;
const CONTRACTS = ["CDI", "CDD", "ALTERNANCE", "STAGE"] as const;
const LEVELS = ["EMPLOYEE", "MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const;

export function AnalyticsFilterBar({
  departments,
  showContractAndLevel = true,
}: {
  departments: string[];
  showContractAndLevel?: boolean;
}) {
  const t = useTranslations("hrAnalytics.filters");
  const tContract = useTranslations("contractType");
  const tRole = useTranslations("roles");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const selectClass =
    "h-9 rounded-lg border bg-background px-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="f-department">
        {t("department")}
      </label>
      <select
        id="f-department"
        className={selectClass}
        value={params.get("department") ?? ""}
        onChange={(e) => set("department", e.target.value)}
      >
        <option value="">{t("allDepartments")}</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        aria-label={t("period")}
        className={selectClass}
        value={params.get("period") ?? "year"}
        onChange={(e) => set("period", e.target.value)}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {t(p)}
          </option>
        ))}
      </select>

      {showContractAndLevel && (
        <>
          <select
            aria-label={t("contract")}
            className={selectClass}
            value={params.get("contractType") ?? ""}
            onChange={(e) => set("contractType", e.target.value)}
          >
            <option value="">{tContract("all")}</option>
            {CONTRACTS.map((c) => (
              <option key={c} value={c}>
                {tContract(c)}
              </option>
            ))}
          </select>

          <select
            aria-label={t("level")}
            className={selectClass}
            value={params.get("level") ?? ""}
            onChange={(e) => set("level", e.target.value)}
          >
            <option value="">{t("allLevels")}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {tRole(l)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

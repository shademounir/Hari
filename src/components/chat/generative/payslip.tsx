import { Receipt } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { useOrgSettings } from "@/components/org-settings-provider";

export function Payslip({
  payslip,
}: {
  payslip: {
    employeeName: string;
    period: string;
    grossMonthly: number;
    tax: number;
    netMonthly: number;
  };
}) {
  const t = useTranslations("payslip");
  const locale = useLocale();
  const { currency } = useOrgSettings();
  const row = (label: string, value: number, strong = false) => (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "tabular-nums"}>
        {formatCurrency(value, currency, locale)}
      </span>
    </div>
  );
  return (
    <div className="max-w-xs rounded-lg border bg-card p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Receipt className="size-4 text-muted-foreground" />
        <span className="font-medium">{payslip.employeeName}</span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{payslip.period}</p>
      <div className="space-y-1">
        {row(t("gross"), payslip.grossMonthly)}
        {row(t("tax"), -payslip.tax)}
        <div className="my-1 border-t" />
        {row(t("net"), payslip.netMonthly, true)}
      </div>
    </div>
  );
}

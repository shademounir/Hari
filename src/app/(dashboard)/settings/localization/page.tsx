import { getTranslations } from "next-intl/server";
import { CURRENCIES, TIMEZONES, getOrgSettings } from "@/lib/settings";
import { updateOrgSettings } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function LocalizationSettingsPage() {
  const t = await getTranslations("settings");
  const orgSettings = await getOrgSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("localization")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("localizationDescription")}</p>
      </CardHeader>
      <CardContent>
        <form action={updateOrgSettings} className="flex flex-wrap items-end gap-4">
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">{t("currency")}</span>
            <select
              name="currency"
              defaultValue={orgSettings.currency}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted-foreground">{t("timezone")}</span>
            <select
              name="timezone"
              defaultValue={orgSettings.timezone}
              className="block rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm">{t("save")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

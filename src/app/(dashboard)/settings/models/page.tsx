import { getTranslations } from "next-intl/server";
import { CHAT_MODELS, DEFAULT_MODEL_ID, isGatewayConfigured } from "@/lib/ai/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ModelsSettingsPage() {
  const t = await getTranslations("settings");
  const gatewayReady = isGatewayConfigured();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("modelRegistry")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("modelRegistryDescription")}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {CHAT_MODELS.map((m) => {
          const unavailable = m.provider === "gateway" && !gatewayReady;
          return (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border px-4 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{m.label}</span>
                <code className="ml-2 text-xs text-muted-foreground">{m.providerModelId}</code>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{m.provider}</Badge>
                {m.reasoning && <Badge variant="secondary">{t("reasoning")}</Badge>}
                {m.id === DEFAULT_MODEL_ID && <Badge>{t("default")}</Badge>}
                {unavailable && <Badge variant="outline">{t("requiresGatewayKey")}</Badge>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

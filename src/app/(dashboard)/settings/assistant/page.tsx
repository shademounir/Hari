import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { listAssistantCollections } from "@/lib/kb";
import { setCollectionAssistantAction } from "../actions";
import { AssistantCollectionsList } from "@/components/kb/assistant-collections-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AssistantAccessSettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("kb");
  const collections = await listAssistantCollections({ role: user.role, id: user.id });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("assistantAccessTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("assistantAccessDescription")}</p>
      </CardHeader>
      <CardContent>
        <AssistantCollectionsList
          collections={collections}
          setCollection={setCollectionAssistantAction}
        />
      </CardContent>
    </Card>
  );
}

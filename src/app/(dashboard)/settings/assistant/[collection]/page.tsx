import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getAssistantCollection, listAssistantDocuments } from "@/lib/kb";
import { setDocumentAssistantAction } from "../../actions";
import { AssistantDocumentsManager } from "@/components/kb/assistant-documents-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AssistantDocumentsPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const { collection } = await params;
  const sp = await searchParams;
  const caller = { role: user.role, id: user.id };

  const col = await getAssistantCollection(caller, collection);
  if (!col) notFound();

  const t = await getTranslations("kb");
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);
  const q = sp.q?.trim() || undefined;
  const data = await listAssistantDocuments(caller, collection, { q, page, pageSize: 20 });

  return (
    <Card>
      <CardHeader>
        <Link
          href="/settings/assistant"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          {t("assistantBackToCollections")}
        </Link>
        <CardTitle className="flex items-center gap-2">
          {col.name}
          <Badge variant={col.assistantEnabled ? "secondary" : "outline"} className="text-[10px]">
            {col.assistantEnabled ? t("assistantBadgeOn") : t("assistantBadgeOff")}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("assistantAccessDescription")}</p>
      </CardHeader>
      <CardContent>
        <AssistantDocumentsManager
          key={`${data.page}-${q ?? ""}`}
          documents={data.documents}
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          query={q ?? ""}
          collectionEnabled={col.assistantEnabled}
          setDocument={setDocumentAssistantAction}
          basePath={`/settings/assistant/${col.id}`}
        />
      </CardContent>
    </Card>
  );
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listCollectionsForAdmin, listDocumentsForAdmin, isStatus } from "@/lib/kb";
import {
  publishDocumentAction,
  unpublishDocumentAction,
  archiveDocumentAction,
  deleteDocumentAction,
  deleteCollectionAction,
} from "./actions";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { DocumentRowActions } from "@/components/kb/document-row-actions";
import { CollectionRowActions } from "@/components/kb/collection-row-actions";
import { CollectionCover } from "@/components/kb/collection-cover";
import { SavedToast } from "@/components/kb/saved-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus } from "lucide-react";
import { DocStatus } from "@prisma/client";

const STATUS_VARIANT: Record<DocStatus, "default" | "secondary" | "outline"> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  ARCHIVED: "outline",
};

export default async function KbAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    q?: string;
    status?: string;
    collection?: string;
    sort?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "kb:manage")) redirect("/"); // belt-and-suspenders

  const sp = await searchParams;
  const caller = { role: user.role };
  const t = await getTranslations("kb");
  const tStatus = await getTranslations("kbStatus");
  const tVis = await getTranslations("kbVisibility");
  const tc = await getTranslations("common");

  const filters = {
    q: sp.q?.trim() || undefined,
    status: sp.status && isStatus(sp.status) ? sp.status : undefined,
    collectionId: sp.collection || undefined,
    sort: sp.sort === "title" ? ("title" as const) : ("recent" as const),
  };
  const [collections, documents] = await Promise.all([
    listCollectionsForAdmin(caller),
    listDocumentsForAdmin(caller, filters),
  ]);

  return (
    <>
      <SavedToast show={sp.saved === "1"} message={t("toastSaved")} />
      <PageHeader title={t("adminTitle")} description={t("adminDescription")}>
        <ButtonLink href="/kb" size="sm" variant="outline">
          <ArrowLeft className="size-4" /> {t("backToReader")}
        </ButtonLink>
      </PageHeader>

      <div className="space-y-6 p-4 md:p-8">
        {/* Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>{t("documentsHeading")}</CardTitle>
            <ButtonLink href="/kb/admin/documents/new" size="sm">
              <Plus className="size-4" /> {t("newDocument")}
            </ButtonLink>
          </CardHeader>
          <CardContent>
            {/* Filter bar — plain GET form, no client JS needed. */}
            <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder={t("filterTitlePlaceholder")}
                className="h-8 w-48"
              />
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("allStatuses")}</option>
                {Object.values(DocStatus).map((s) => (
                  <option key={s} value={s}>{tStatus(s)}</option>
                ))}
              </select>
              <select
                name="collection"
                defaultValue={filters.collectionId ?? ""}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{t("allCollections")}</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                name="sort"
                defaultValue={filters.sort}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="recent">{t("sortRecent")}</option>
                <option value="title">{t("sortTitle")}</option>
              </select>
              <Button type="submit" size="sm" variant="outline">{t("apply")}</Button>
              <ButtonLink href="/kb/admin" size="sm" variant="ghost">{t("clearFilters")}</ButtonLink>
            </form>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">{t("name")}</TableHead>
                    <TableHead>{t("collection")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("visibility")}</TableHead>
                    <TableHead>{t("updatedByCol")}</TableHead>
                    <TableHead className="text-right">{t("viewsCol")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {d.title}
                          {d.assistantOverride === false && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {t("assistantDocHidden")}
                            </Badge>
                          )}
                          {d.assistantOverride === true && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {t("assistantDocForced")}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.collection.name}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status]}>{tStatus(d.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tVis(d.visibility)}</TableCell>
                      <TableCell className="text-muted-foreground">{d.updatedByName ?? tc("none")}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{d.viewCount}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DocumentRowActions
                            doc={{ id: d.id, title: d.title, status: d.status }}
                            publish={publishDocumentAction}
                            unpublish={unpublishDocumentAction}
                            archive={archiveDocumentAction}
                            remove={deleteDocumentAction}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        {t("noDocuments")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Collections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>{t("collectionsHeading")}</CardTitle>
            <ButtonLink href="/kb/admin/collections/new" size="sm">
              <Plus className="size-4" /> {t("newCollection")}
            </ButtonLink>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">{t("name")}</TableHead>
                    <TableHead>{t("documentsHeading")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {c.image && (
                            <CollectionCover
                              src={c.image}
                              className="size-8 shrink-0 rounded border"
                              sizes="32px"
                            />
                          )}
                          <span>
                            {c.name}
                            <code className="ml-2 text-xs text-muted-foreground">/{c.slug}</code>
                          </span>
                          {!c.assistantEnabled && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {t("assistantBadgeOff")}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t("documentCount", { count: c.documentCount })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <CollectionRowActions
                            collection={{ id: c.id, name: c.name }}
                            remove={deleteCollectionAction}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {collections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                        {t("noCollections")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

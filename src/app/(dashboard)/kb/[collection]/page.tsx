import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getCollection } from "@/lib/kb";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumbLabels } from "@/components/layout/breadcrumb-labels";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { CollectionCover } from "@/components/kb/collection-cover";
import { FileText, Plus, Settings2 } from "lucide-react";

type Props = { params: Promise<{ collection: string }> };

export default async function CollectionPage({ params }: Props) {
  const user = await requireUser();
  const { collection } = await params;

  // null if missing or nothing the caller may see — same not-found-on-restricted
  // posture as the article page.
  const col = await getCollection(user, collection);
  if (!col) notFound();

  const t = await getTranslations("kb");
  const tVis = await getTranslations("kbVisibility");
  const format = await getFormatter();
  const canManage = can(user, "kb:manage");

  return (
    <>
      {/* The top bar only sees slugs. Register this collection plus every article
          it links to, so their crumbs are right on arrival. */}
      <SetBreadcrumbLabels
        labels={{
          [`/kb/${col.slug}`]: col.name,
          ...Object.fromEntries(col.articles.map((a) => [`/kb/${col.slug}/${a.slug}`, a.title])),
        }}
      />

      {/* Constrained to match the article grid below it. */}
      <PageHeader
        title={col.name}
        description={col.description ?? undefined}
        className="mx-auto max-w-4xl"
      >
        {canManage && (
          <ButtonLink href="/kb/admin" size="sm" variant="outline">
            <Settings2 className="size-4" /> {t("manage")}
          </ButtonLink>
        )}
      </PageHeader>

      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        {/* Decorative cover — alt="" so screen readers skip it. */}
        {col.image && (
          <CollectionCover
            src={col.image}
            className="h-40 w-full rounded-xl border sm:h-48"
            sizes="(max-width: 768px) 100vw, 700px"
          />
        )}

        <p className="text-sm text-muted-foreground">
          {t("articleCount", { count: col.articles.length })}
        </p>

        {col.articles.length === 0 && (
          <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {t("emptyCollection")}
          </p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {col.articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/kb/${col.slug}/${a.slug}`}
                className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-background">
                    <FileText className="size-4" />
                  </span>
                  {a.visibility !== "ALL_EMPLOYEES" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {tVis(a.visibility)}
                    </Badge>
                  )}
                </div>
                <span className="font-medium leading-snug">{a.title}</span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {t("lastUpdated")}: {format.dateTime(a.updatedAt, { dateStyle: "medium" })}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {canManage && (
          <ButtonLink href="/kb/admin/documents/new" size="sm" variant="ghost">
            <Plus className="size-4" /> {t("newDocument")}
          </ButtonLink>
        )}
      </div>
    </>
  );
}

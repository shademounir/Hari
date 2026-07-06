import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listCollectionsWithArticles } from "@/lib/kb";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { KbSearch } from "@/components/kb/kb-search";
import { CollectionCover } from "@/components/kb/collection-cover";
import { Settings2, ArrowRight, BookOpen } from "lucide-react";

export default async function KnowledgeBasePage() {
  const user = await requireUser();
  const t = await getTranslations("kb");
  const collections = await listCollectionsWithArticles({ role: user.role });
  const canManage = can(user.role, "kb:manage");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")}>
        <div className="flex items-center gap-2">
          <KbSearch />
          {canManage && (
            <ButtonLink href="/kb/admin" size="sm" variant="outline">
              <Settings2 className="size-4" /> {t("manage")}
            </ButtonLink>
          )}
        </div>
      </PageHeader>

      <div className="p-4 md:p-8">
        {collections.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyReader")}</p>
        ) : (
          // Pick a collection here → its page lists the articles. One clear step
          // each, so the collection page is a first-class destination.
          <ul className="grid gap-4 sm:grid-cols-2">
            {collections.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/kb/${c.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Decorative cover — alt="" so screen readers skip it. */}
                  {c.image ? (
                    <CollectionCover
                      src={c.image}
                      className="h-24 w-full"
                      sizes="(max-width: 640px) 100vw, 300px"
                    />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-muted text-muted-foreground">
                      <BookOpen className="size-6" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="font-medium leading-snug">{c.name}</h2>
                    {c.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t("articleCount", { count: c.articles.length })}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground/70 group-hover:text-foreground">
                        {t("browse")}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

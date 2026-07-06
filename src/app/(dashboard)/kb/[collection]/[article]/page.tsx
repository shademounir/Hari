import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getArticle, getRelatedArticles, getUserFeedback, incrementViewCount } from "@/lib/kb";
import { extractToc, readingMinutes } from "@/lib/kb/html";
import { PageHeader } from "@/components/layout/page-header";
import { ArticleContent } from "@/components/kb/article-content";
import { ArticleFeedback } from "@/components/kb/article-feedback";
import { Toc } from "@/components/kb/toc";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, FileText } from "lucide-react";

type Props = { params: Promise<{ collection: string; article: string }> };

export default async function ArticlePage({ params }: Props) {
  const user = await requireUser();
  const { collection, article } = await params;
  const caller = { role: user.role, id: user.id };

  // Returns null for not-found / unpublished / above the caller's tier — a
  // guessed or stale URL is indistinguishable from a missing page.
  const doc = await getArticle(caller, collection, article);
  if (!doc) notFound();

  const t = await getTranslations("kb");
  const format = await getFormatter();
  const toc = extractToc(doc.content);
  void incrementViewCount(doc.id); // best-effort; never block the render
  const [related, myVote] = await Promise.all([
    getRelatedArticles(caller, collection, doc.id),
    getUserFeedback(caller, doc.id),
  ]);

  return (
    <>
      <PageHeader title={doc.title}>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {doc.authorName && <>{t("by", { name: doc.authorName })} · </>}
          {t("lastUpdated")}: {format.dateTime(doc.updatedAt, { dateStyle: "medium" })} ·{" "}
          {t("readingTime", { min: readingMinutes(doc.content) })}
        </span>
      </PageHeader>

      <div className="mx-auto flex max-w-5xl gap-8 p-4 md:p-8">
        <article className="min-w-0 max-w-3xl flex-1 space-y-4">
          <nav
            aria-label={t("breadcrumb")}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Link href="/kb" className="hover:text-foreground hover:underline">
              {t("title")}
            </Link>
            <ChevronRight className="size-3" />
            <Link
              href={`/kb/${doc.collection.slug}`}
              className="hover:text-foreground hover:underline"
            >
              {doc.collection.name}
            </Link>
          </nav>

          <ArticleContent content={doc.content} />

          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {doc.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <ArticleFeedback documentId={doc.id} initialVote={myVote} />

          {related.length > 0 && (
            <section className="mt-8 border-t pt-5">
              <h2 className="mb-3 text-sm font-semibold">{t("relatedArticles")}</h2>
              <ul className="space-y-1">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/kb/${doc.collection.slug}/${r.slug}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{r.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        {toc.length > 0 && (
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-8">
              <Toc items={toc} label={t("onThisPage")} />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

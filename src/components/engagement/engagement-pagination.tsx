import { getTranslations } from "next-intl/server";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Sp = Record<string, string | string[] | undefined>;

// Server Component: bookmarkable page links that preserve every active filter
// (dept[]/band[]/manager/q/sort) in each href. Pure navigation, no client JS.
export async function EngagementPagination({
  page,
  pageCount,
  total,
  pageSize,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  params: Sp;
}) {
  const t = await getTranslations("engagement.pagination");

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
      else qs.set(key, value);
    }
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `?${s}` : "?";
  };

  // Windowed page numbers: first, last, and a ±1 window around current.
  const pages: (number | "ellipsis")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) pages.push(p);
    else if (pages[pages.length - 1] !== "ellipsis") pages.push("ellipsis");
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">{t("showing", { from, to, total })}</p>

      {pageCount > 1 && (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                label={t("previous")}
                href={hrefFor(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <PaginationItem key={`e${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink href={hrefFor(p)} isActive={p === page}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                label={t("next")}
                href={hrefFor(Math.min(pageCount, page + 1))}
                aria-disabled={page >= pageCount}
                className={page >= pageCount ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

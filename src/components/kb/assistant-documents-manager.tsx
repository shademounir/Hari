"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ServerAction = (formData: FormData) => void | Promise<void>;
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Doc = { id: string; title: string; status: Status; override: boolean | null; effective: boolean };

// Per-document assistant overrides for one collection. Search + pagination are
// URL-driven (server-rendered), so the page stays fast at thousands of docs; this
// component is re-keyed per page/query, so its local optimistic state starts fresh
// on every navigation.
export function AssistantDocumentsManager({
  documents,
  total,
  page,
  pageSize,
  query,
  collectionEnabled,
  setDocument,
  basePath,
}: {
  documents: Doc[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  collectionEnabled: boolean;
  setDocument: ServerAction;
  basePath: string;
}) {
  const t = useTranslations("kb");
  const router = useRouter();
  const [docs, setDocs] = useState(documents);
  const [q, setQ] = useState(query);
  const [, start] = useTransition();

  const pages = Math.max(Math.ceil(total / pageSize), 1);

  function go(nextPage: number, search: string) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    go(1, q);
  }

  function change(id: string, value: "inherit" | "on" | "off") {
    const override = value === "inherit" ? null : value === "on";
    const prev = docs;
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, override } : d)));
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("documentId", id);
        fd.set("override", value);
        await setDocument(fd);
        toast.success(t("assistantSaved"));
      } catch {
        setDocs(prev);
        toast.error(t("assistantSaveFailed"));
      }
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("assistantSearchDocuments")}
          className="pl-8"
        />
      </form>

      <ul className="divide-y rounded-lg border">
        {docs.map((d) => {
          const effective = d.override ?? collectionEnabled;
          const value = d.override === null ? "inherit" : d.override ? "on" : "off";
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
              <span className="text-xs text-muted-foreground">
                {effective ? t("assistantEffectiveOn") : t("assistantEffectiveOff")}
              </span>
              <select
                value={value}
                onChange={(e) => change(d.id, e.target.value as "inherit" | "on" | "off")}
                aria-label={t("assistantDocAria", { title: d.title })}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="inherit">{t("assistantOverrideInherit")}</option>
                <option value="on">{t("assistantOverrideOn")}</option>
                <option value="off">{t("assistantOverrideOff")}</option>
              </select>
            </li>
          );
        })}
        {docs.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("assistantNoResults")}
          </li>
        )}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("paginationPageOf", { page, pages })}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => go(page - 1, q)}
            >
              {t("paginationPrev")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => go(page + 1, q)}
            >
              {t("paginationNext")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

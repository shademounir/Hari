"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type ServerAction = (formData: FormData) => void | Promise<void>;
type Row = {
  id: string;
  name: string;
  assistantEnabled: boolean;
  documentCount: number;
  overrideCount: number;
};

// Collection-level assistant switches. Documents are managed on a dedicated
// per-collection page (linked here) so this list never loads thousands of rows.
export function AssistantCollectionsList({
  collections: initial,
  setCollection,
}: {
  collections: Row[];
  setCollection: ServerAction;
}) {
  const t = useTranslations("kb");
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [, start] = useTransition();

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string, enabled: boolean) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, assistantEnabled: enabled } : r)));
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("collectionId", id);
        fd.set("enabled", String(enabled));
        await setCollection(fd);
        toast.success(t("assistantSaved"));
      } catch {
        setRows(prev);
        toast.error(t("assistantSaveFailed"));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("assistantSearchCollections")}
          className="pl-8"
        />
      </div>

      <ul className="divide-y rounded-lg border">
        {filtered.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {c.overrideCount > 0 && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {t("assistantOverridesCount", { count: c.overrideCount })}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {t("documentCount", { count: c.documentCount })}
              </span>
            </div>
            <Link
              href={`/settings/assistant/${c.id}`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("assistantManageDocuments")}
              <ChevronRight className="size-4" />
            </Link>
            <Switch
              checked={c.assistantEnabled}
              onCheckedChange={(v) => toggle(c.id, v)}
              aria-label={t("assistantCollectionAria", { name: c.name })}
            />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("assistantNoResults")}
          </li>
        )}
      </ul>
    </div>
  );
}

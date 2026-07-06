"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/kb/markdown";

// Slug input with a clean URL preview. The slug is slugified live (matching the
// server's uniqueSlug); the preview shows the full reader path. For documents,
// pass `collections` so the preview reflects the actually-selected collection
// (mirrors the form's collection <select>) instead of a placeholder segment. A
// warning shows when changing a slug that already has live links.
export function SlugField({
  defaultValue = "",
  basePath,
  originalSlug,
  warnOnChange = false,
  collections,
}: {
  defaultValue?: string;
  basePath: string; // reader root, e.g. "/kb/"
  originalSlug?: string;
  warnOnChange?: boolean;
  collections?: { id: string; slug: string }[]; // document: resolves the collection segment
}) {
  const t = useTranslations("kb");
  const id = useId();
  const [value, setValue] = useState(defaultValue);

  // Mirror the collection <select> (external DOM control) so the preview path
  // stays accurate — subscribed directly, without a setState-in-effect.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!collections) return () => {};
      const sel = document.querySelector<HTMLSelectElement>('select[name="collectionId"]');
      sel?.addEventListener("change", onChange);
      return () => sel?.removeEventListener("change", onChange);
    },
    [collections],
  );
  const collectionId = useSyncExternalStore(
    subscribe,
    () =>
      collections
        ? document.querySelector<HTMLSelectElement>('select[name="collectionId"]')?.value ?? ""
        : "",
    () => "",
  );

  const effective = slugify(value);
  const changed = warnOnChange && !!originalSlug && !!effective && effective !== originalSlug;
  const collectionSlug = collections?.find((c) => c.id === collectionId)?.slug;
  const prefix = collections ? `${basePath}${collectionSlug ? `${collectionSlug}/` : ""}` : basePath;

  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={id} className="block font-medium">{t("fieldSlug")}</label>
      <Input
        id={id}
        name="slug"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("slugPlaceholder")}
      />
      <span className="block text-xs text-muted-foreground">{t("fieldSlugHint")}</span>
      {effective && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          {/* Wrap (don't truncate) so the slug — the part that matters — is never hidden. */}
          <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
            {prefix}
            <span className="text-foreground">{effective}</span>
          </span>
        </div>
      )}
      {changed && <span className="block text-xs text-destructive">{t("slugChangeWarning")}</span>}
    </div>
  );
}

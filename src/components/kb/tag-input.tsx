"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

// Tag editor: existing tags render as removable pills; type and press Enter or
// comma to add, Backspace on an empty field removes the last. The value is
// mirrored into a hidden input (comma-joined) so the existing server action reads
// it unchanged.
export function TagInput({ name, defaultValue = [] }: { name: string; defaultValue?: string[] }) {
  const t = useTranslations("kb");
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const v = raw.trim();
    setDraft("");
    if (v) setTags((ts) => (ts.includes(v) ? ts : [...ts, v]));
  };
  const remove = (tag: string) => setTags((ts) => ts.filter((x) => x !== tag));

  return (
    <div className="space-y-1 text-sm">
      <span className="block font-medium">{t("fieldTags")}</span>
      <input type="hidden" name={name} value={tags.join(",")} />

      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring"
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={t("tagRemove", { tag })}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => add(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? t("tagAdd") : ""}
          aria-label={t("fieldTags")}
          className="min-w-[6rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
      <span className="block text-xs text-muted-foreground">{t("fieldTagsHint")}</span>
    </div>
  );
}

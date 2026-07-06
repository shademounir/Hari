"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { PILL_CLASS } from "@/components/kb/pill-radio-group";

type Collection = { id: string; name: string; assistantEnabled: boolean };
type Value = "inherit" | "on" | "off";

// Per-document chatbot access on the article form. Inherits the selected
// collection by default; can include/exclude this article. Rendered only for
// eligible roles (admin:settings); the server re-checks before honoring it.
// Pills are native radios (keyboard + form submit for free); the hint resolves
// what the choice means against the currently-selected collection.
export function AssistantOverrideField({
  collections,
  defaultCollectionId,
  defaultOverride,
}: {
  collections: Collection[];
  defaultCollectionId: string;
  defaultOverride: boolean | null;
}) {
  const t = useTranslations("kb");
  const [value, setValue] = useState<Value>(
    defaultOverride === null ? "inherit" : defaultOverride ? "on" : "off",
  );

  // Mirror the form's collection <select> (external DOM control) so the hint
  // reflects the chosen collection — subscribed directly, without a
  // setState-in-effect to keep the two in sync.
  const subscribe = useCallback((onChange: () => void) => {
    const sel = document.querySelector<HTMLSelectElement>('select[name="collectionId"]');
    sel?.addEventListener("change", onChange);
    return () => sel?.removeEventListener("change", onChange);
  }, []);
  const collectionId = useSyncExternalStore(
    subscribe,
    () =>
      document.querySelector<HTMLSelectElement>('select[name="collectionId"]')?.value ||
      defaultCollectionId,
    () => defaultCollectionId,
  );

  const collectionEnabled =
    collections.find((c) => c.id === collectionId)?.assistantEnabled ?? true;
  const inheritState = collectionEnabled ? t("assistantEffectiveOn") : t("assistantEffectiveOff");
  const hint =
    value === "inherit"
      ? t("assistantHintInherit", { state: inheritState })
      : value === "on"
        ? t("assistantFieldHintOn")
        : t("assistantFieldHintOff");

  const options: { value: Value; label: string }[] = [
    { value: "inherit", label: t("assistantOverrideInherit") },
    { value: "on", label: t("assistantOverrideOn") },
    { value: "off", label: t("assistantOverrideOff") },
  ];

  return (
    <div className="space-y-1.5 text-sm">
      <span className="block font-medium">{t("assistantFieldLabel")}</span>
      <div role="radiogroup" aria-label={t("assistantFieldLabel")} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="radio"
              name="assistantOverride"
              value={o.value}
              checked={value === o.value}
              onChange={() => setValue(o.value)}
              className="peer sr-only"
            />
            <span className={PILL_CLASS}>{o.label}</span>
          </label>
        ))}
      </div>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

// Pill-styled radio group built on native <input type="radio"> — keyboard nav and
// form submission come for free, and the visible pill is the radio's label. Pure
// (no hooks) so it works in server and client components alike.

// Shared pill look, reused by other pill controls (e.g. the chatbot-access field).
export const PILL_CLASS =
  "inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background";

export function PillRadioGroup({
  name,
  options,
  defaultValue,
  ariaLabel,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={o.value === defaultValue}
            className="peer sr-only"
          />
          <span className={PILL_CLASS}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

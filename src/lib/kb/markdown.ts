// ─────────────────────────────────────────────────────────────────────────
// Shared KB heading-slug helpers. The crux of anchor-precise citations: a
// chunk's `anchor` (from `chunkHtml`, lib/kb/html.ts) MUST equal the `id` the
// reader puts on the matching heading (rehypeKbAnchors). Both sides slug headings
// with `createSlugger()` walking headings in document order, so the nth heading
// gets the same slug on both sides — and a citation deep-link
// (`/kb/{collection}/{article}#{anchor}`) always lands on a real section.
// ─────────────────────────────────────────────────────────────────────────

/** Base slug: lowercase, strip accents, non-alphanumerics → single hyphen. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // drop combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A stateful slugger that disambiguates repeated headings deterministically
 * (`overview`, `overview-2`, …). Create one per document/render and feed it
 * headings in document order so the chunker and the reader agree.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

export type DocChunk = {
  section: string; // heading text (or "Introduction" for pre-heading content)
  anchor: string; // heading slug; "" for the intro chunk → link to article root
  content: string; // section plain text (for embedding + snippet)
  chunkIndex: number;
};

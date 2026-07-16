// Client-safe mirror of `normalizeSlug` in lib/roles.ts (which is server-only,
// so the editor can't import it). It only powers the live preview — the server
// normalizes again and is the authority, so the two drifting shows a wrong
// preview, never a wrong slug.
export function normalizeSlugClient(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

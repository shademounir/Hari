// A tiny rehype plugin that turns inline citation markers like `[1]` in the
// assistant's answer into links to the exact article section. The number→URL map
// comes from the searchHandbook tool output (see message.tsx), so the link target
// is always DB-derived — the model only ever writes the number.
//
// Implemented as a manual hast walk to avoid pulling in unist-util-visit. Text
// inside <code>/<pre>/<a> is left untouched, and an `[n]` with no mapping stays
// plain text (never a broken link).

type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

// Match a citation marker around a number, tolerating the fullwidth/CJK brackets
// some models (e.g. gpt-oss) emit — 【1】, ［1］, 〔1〕 — as well as ASCII [1], with
// optional inner spaces. The rendered marker is always normalized back to ASCII
// [n] (see splitText), so the visible citation is consistent regardless of input.
const REF_RE = /[[【［〔]\s*(\d+)\s*[\]】］〕]/g;

export type CitationTarget = { url: string };

export function rehypeCitations(map: Map<number, CitationTarget>) {
  return (tree: HastNode) => walk(tree, map);
}

function walk(node: HastNode | undefined, map: Map<number, CitationTarget>) {
  if (!node) return;
  const children = (node as HastElement).children;
  if (!Array.isArray(children)) return;

  // Don't linkify text directly inside code/pre/a (`node` is that parent).
  const tag = (node as HastElement).tagName;
  const skip = tag === "code" || tag === "pre" || tag === "a";

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "text" && !skip) {
      const replacement = splitText((child as HastText).value, map);
      if (replacement) {
        children.splice(i, 1, ...replacement);
        i += replacement.length - 1; // skip the inserted nodes
      }
    } else {
      walk(child, map);
    }
  }
}

// Returns null when there's nothing to replace (so we don't churn the tree).
function splitText(value: string, map: Map<number, CitationTarget>): HastNode[] | null {
  REF_RE.lastIndex = 0;
  if (!REF_RE.test(value)) return null;

  REF_RE.lastIndex = 0;
  const out: HastNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let replaced = false;

  while ((m = REF_RE.exec(value)) !== null) {
    const ref = Number(m[1]);
    const target = map.get(ref);
    if (!target) continue; // unmapped → leave as plain text
    if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
    out.push({
      type: "element",
      tagName: "a",
      properties: { href: target.url, className: ["citation-ref"] },
      children: [{ type: "text", value: `[${ref}]` }],
    });
    last = m.index + m[0].length;
    replaced = true;
  }
  if (!replaced) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

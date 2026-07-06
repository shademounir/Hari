// Gives each h2/h3 a stable id using the SAME createSlugger order as chunkHtml,
// in one parse pass (not in the heading React component) so the stateful slugger
// isn't re-run/desynced by re-renders or StrictMode.
import { createSlugger } from "@/lib/kb/markdown";

type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

function textOf(node: HastNode): string {
  if (node.type === "text") return (node as HastText).value;
  const children = (node as HastElement).children;
  return Array.isArray(children) ? children.map(textOf).join("") : "";
}

export function rehypeKbAnchors() {
  return (tree: HastNode) => {
    const slug = createSlugger();
    const walk = (node: HastNode) => {
      const el = node as HastElement;
      if (el.type === "element" && (el.tagName === "h2" || el.tagName === "h3")) {
        el.properties = { ...el.properties, id: slug(textOf(el)) };
      }
      if (Array.isArray(el.children)) el.children.forEach(walk);
    };
    walk(tree);
  };
}

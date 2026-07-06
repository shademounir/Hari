import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { rehypeCitations } from "@/components/chat/citations-rehype";
import { Markdown } from "@/components/chat/markdown";

// Build a minimal hast tree: <p>{text}</p>
function pTree(text: string) {
  return {
    type: "root",
    children: [
      { type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: text }] },
    ],
  } as never;
}

function citationAnchor(tree: unknown) {
  const p = (tree as { children: { children: unknown[] }[] }).children[0];
  return (p.children as { tagName?: string; properties?: Record<string, unknown> }[]).find(
    (n) => n.tagName === "a",
  );
}

describe("rehypeCitations — bracket tolerance", () => {
  const map = new Map([[1, { url: "/kb/x#y" }]]);

  it("linkifies ASCII [1]", () => {
    const t = pTree("Parental leave is 16 weeks [1].");
    rehypeCitations(map)(t);
    expect(citationAnchor(t)?.properties?.href).toBe("/kb/x#y");
  });

  it("linkifies fullwidth 【1】 (the gpt-oss failure mode) and normalizes to [1]", () => {
    const t = pTree("Parental leave is 16 weeks 【1】.");
    rehypeCitations(map)(t);
    const a = citationAnchor(t) as { properties?: Record<string, unknown>; children?: { value?: string }[] };
    expect(a?.properties?.href).toBe("/kb/x#y");
    expect(a?.children?.[0]?.value).toBe("[1]"); // displayed marker normalized to ASCII
  });

  it("leaves an unmapped number as plain text (no broken link)", () => {
    const t = pTree("See [9] for details.");
    rehypeCitations(map)(t);
    expect(citationAnchor(t)).toBeFalsy();
  });
});

describe("Markdown — citation renders as a link", () => {
  it("produces an <a> with the citation href for [1]", () => {
    const map = new Map([[1, { url: "/kb/employee-handbook/leave#parental" }]]);
    const html = renderToStaticMarkup(
      <Markdown citations={map}>{"Parental leave is 16 weeks [1]."}</Markdown>,
    );
    expect(html).toContain('href="/kb/employee-handbook/leave#parental"');
    expect(html).toContain("[1]");
  });
});

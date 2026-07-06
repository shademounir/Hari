import { describe, it, expect } from "vitest";
import { rehypeCitations } from "@/components/chat/citations-rehype";

// Minimal hast helpers.
const text = (value: string) => ({ type: "text", value });
const el = (tagName: string, children: unknown[]) => ({
  type: "element",
  tagName,
  properties: {},
  children,
});

describe("rehypeCitations — inline [n] linkification", () => {
  it("replaces mapped [n] with links and leaves unmapped ones as text", () => {
    const map = new Map([
      [1, { url: "/kb/c/a#parental-leave" }],
      [2, { url: "/kb/c/a#sick-leave" }],
    ]);
    const tree = { type: "root", children: [el("p", [text("See [1] and [2] and [9].")])] };

    rehypeCitations(map)(tree as never);

    const p = (tree.children[0] as { children: unknown[] });
    const kinds = p.children.map((c) => {
      const n = c as { type: string; tagName?: string; properties?: { href?: string } };
      return n.type === "element" ? `a:${n.properties?.href}` : "text";
    });
    expect(kinds).toEqual([
      "text", // "See "
      "a:/kb/c/a#parental-leave", // [1]
      "text", // " and "
      "a:/kb/c/a#sick-leave", // [2]
      "text", // " and [9]." (unmapped → plain text)
    ]);
  });

  it("does not touch text inside code/pre/a", () => {
    const map = new Map([[1, { url: "/kb/c/a#x" }]]);
    const tree = { type: "root", children: [el("code", [text("literal [1]")])] };
    rehypeCitations(map)(tree as never);
    const code = tree.children[0] as { children: { type: string; value?: string }[] };
    expect(code.children).toHaveLength(1);
    expect(code.children[0].value).toBe("literal [1]");
  });
});

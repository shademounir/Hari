import { describe, it, expect } from "vitest";
import { slugify, createSlugger } from "@/lib/kb/markdown";
import { chunkHtml } from "@/lib/kb/html";

describe("slugify", () => {
  it("strips accents and lowercases", () => {
    expect(slugify("Parental Leave")).toBe("parental-leave");
    expect(slugify("Rémunération & Primes")).toBe("remuneration-primes");
  });
  it("returns empty for non-latin input (caller supplies a fallback)", () => {
    expect(slugify("給与")).toBe("");
  });
});

describe("createSlugger", () => {
  it("disambiguates repeated headings deterministically", () => {
    const slug = createSlugger();
    expect(slug("Overview")).toBe("overview");
    expect(slug("Overview")).toBe("overview-2");
  });
});

describe("chunkHtml", () => {
  it("splits on <h2>/<h3> and slugs each heading", () => {
    const html = "<h2>Vacation</h2><p>Text.</p><h3>Carryover</h3><p>More.</p>";
    const chunks = chunkHtml(html);
    expect(chunks.map((c) => [c.section, c.anchor])).toEqual([
      ["Vacation", "vacation"],
      ["Carryover", "carryover"],
    ]);
    expect(chunks[0].content).toContain("Text.");
  });

  it("captures pre-heading content as an Introduction chunk with no anchor", () => {
    const chunks = chunkHtml("<p>Intro text.</p><h2>First</h2><p>Body.</p>");
    expect(chunks[0]).toMatchObject({ section: "Introduction", anchor: "" });
    expect(chunks[1]).toMatchObject({ section: "First", anchor: "first" });
  });

  it("anchors match what the reader would generate (same slugger order)", () => {
    // Two identical headings → overview, overview-2 on both chunker and reader.
    const html = "<h2>Overview</h2><p>a</p><h2>Overview</h2><p>b</p>";
    expect(chunkHtml(html).map((c) => c.anchor)).toEqual(["overview", "overview-2"]);
  });

  it("treats a heading nested in a wrapper element as a section (recursive walk)", () => {
    const html = "<div><h2>Pay</h2><p>a</p></div><h2>Leave</h2><p>b</p>";
    expect(chunkHtml(html).map((c) => [c.section, c.anchor])).toEqual([
      ["Pay", "pay"],
      ["Leave", "leave"],
    ]);
  });
});

import { describe, it, expect, afterAll, vi } from "vitest";

// Deterministic: stub the embedding call so the suite needs no network/API key.
// A constant query vector is fine — we fetch a large k and assert on the WHERE
// filtering (status + visibility tier), not on ranking.
vi.mock("@/lib/ai/embeddings", () => ({
  embedText: async () => new Array(384).fill(0.01),
  toVectorLiteral: (e: number[]) => `[${e.join(",")}]`,
}));

import { prisma } from "@/lib/prisma";
import { searchHandbook } from "@/lib/rag";
import {
  getArticle,
  listCollectionsWithArticles,
  createDocument,
  updateDocument,
  searchKb,
  setCollectionAssistantAccess,
  setDocumentAssistantAccess,
} from "@/lib/kb";
import type { Role } from "@/lib/rbac";

const as = (role: Role) => ({ role });

afterAll(() => prisma.$disconnect());

// Seeded fixtures (prisma/handbook.ts): an ALL_EMPLOYEES doc, a MANAGERS doc,
// an HR_ONLY doc, and a DRAFT doc.
const ALL = { collection: "employee-handbook", slug: "leave-and-time-off" };
const MANAGERS = { collection: "management", slug: "manager-playbook" };
const HR_ONLY = { collection: "hr-internal", slug: "compensation-bands" };
const DRAFT = { collection: "employee-handbook", slug: "relocation-policy" };

describe("KB reader access control (getArticle / IDOR)", () => {
  it("everyone can read an ALL_EMPLOYEES article", async () => {
    for (const role of ["EMPLOYEE", "MANAGER", "HR_ADMIN"] as Role[]) {
      expect(await getArticle(as(role), ALL.collection, ALL.slug)).not.toBeNull();
    }
  });

  it("a MANAGERS article is hidden from employees, visible to managers+", async () => {
    expect(await getArticle(as("EMPLOYEE"), MANAGERS.collection, MANAGERS.slug)).toBeNull();
    expect(await getArticle(as("MANAGER"), MANAGERS.collection, MANAGERS.slug)).not.toBeNull();
    expect(await getArticle(as("HR_ADMIN"), MANAGERS.collection, MANAGERS.slug)).not.toBeNull();
  });

  it("an HR_ONLY article is hidden from employees and managers, visible to HR", async () => {
    expect(await getArticle(as("EMPLOYEE"), HR_ONLY.collection, HR_ONLY.slug)).toBeNull();
    expect(await getArticle(as("MANAGER"), HR_ONLY.collection, HR_ONLY.slug)).toBeNull();
    expect(await getArticle(as("HR_ADMIN"), HR_ONLY.collection, HR_ONLY.slug)).not.toBeNull();
  });

  it("a DRAFT article is never readable, even by HR", async () => {
    expect(await getArticle(as("HR_ADMIN"), DRAFT.collection, DRAFT.slug)).toBeNull();
  });
});

describe("KB reader listing", () => {
  it("scopes collections/articles to the caller's tier", async () => {
    const empCols = (await listCollectionsWithArticles(as("EMPLOYEE"))).map((c) => c.slug);
    expect(empCols).toContain("employee-handbook");
    expect(empCols).not.toContain("management");
    expect(empCols).not.toContain("hr-internal");

    const hrCols = (await listCollectionsWithArticles(as("HR_ADMIN"))).map((c) => c.slug);
    expect(hrCols).toEqual(expect.arrayContaining(["employee-handbook", "management", "hr-internal"]));
  });

  it("never lists a draft article", async () => {
    const cols = await listCollectionsWithArticles(as("HR_ADMIN"));
    const slugs = cols.flatMap((c) => c.articles.map((a) => a.slug));
    expect(slugs).not.toContain("relocation-policy");
  });
});

describe("RAG retrieval respects status + visibility (HARI-59/62)", () => {
  // Queries use terms that genuinely appear in the target docs so the assertions
  // hold on the lexical (full-text) half alone — i.e. without embeddings, exactly
  // as CI runs (no API key → chunks indexed for FTS only).
  it("an employee never retrieves restricted or draft content", async () => {
    const hits = await searchHandbook("vacation", 100, as("EMPLOYEE"));
    const slugs = hits.map((h) => h.articleSlug);
    expect(slugs).not.toContain("manager-playbook");
    expect(slugs).not.toContain("compensation-bands");
    expect(slugs).not.toContain("relocation-policy"); // draft has no chunks anyway
    expect(slugs).toContain("leave-and-time-off");
    // Hits carry a deep-link target for citations.
    expect(hits.every((h) => h.anchor !== undefined && h.collectionSlug)).toBe(true);
  });

  it("a manager retrieves MANAGERS content but not HR_ONLY", async () => {
    const slugs = (await searchHandbook("calibrate ratings", 100, as("MANAGER"))).map(
      (h) => h.articleSlug,
    );
    expect(slugs).toContain("manager-playbook");
    expect(slugs).not.toContain("compensation-bands");
  });

  it("HR retrieves assistant-enabled content across tiers", async () => {
    // HR sees every tier; the only HR_ONLY collection is assistant-disabled by
    // seed (see the assistant-access suite below), so assert on an assistant-on
    // higher-tier doc to prove HR retrieval + tier reach.
    const slugs = (await searchHandbook("calibrate ratings", 100, as("HR_ADMIN"))).map(
      (h) => h.articleSlug,
    );
    expect(slugs).toContain("manager-playbook");
  });
});

describe("hybrid search — lexical recall (FTS half)", () => {
  // The embedding is mocked to a constant, so the vector half can't rank by
  // meaning. A correct hit for a distinctive exact term therefore proves the
  // full-text (lexical) half + RRF fusion is doing the work.
  it("surfaces a doc by a distinctive keyword the constant embedding can't rank", async () => {
    const hits = await searchHandbook("ethics hotline", 3, as("HR_ADMIN"));
    expect(hits[0]?.articleSlug).toBe("workplace-and-equipment");
  });

  it("still tier-filters lexical hits (employee can't lexically reach HR_ONLY terms)", async () => {
    const slugs = (await searchHandbook("salary bands midpoint", 50, as("EMPLOYEE"))).map(
      (h) => h.articleSlug,
    );
    expect(slugs).not.toContain("compensation-bands");
  });
});

describe("searchKb respects tier scoping", () => {
  it("an employee's search never returns restricted or draft articles", async () => {
    const slugs = (await searchKb(as("EMPLOYEE"), "vacation", 100)).map((r) => r.articleSlug);
    expect(slugs).not.toContain("manager-playbook");
    expect(slugs).not.toContain("compensation-bands");
    expect(slugs).not.toContain("relocation-policy");
    expect(slugs).toContain("leave-and-time-off");
    // Results deep-link to a real section.
    expect((await searchKb(as("EMPLOYEE"), "vacation", 100)).every((r) => r.url.startsWith("/kb/"))).toBe(true);
  });

  it("HR search reaches assistant-enabled higher-tier content", async () => {
    const slugs = (await searchKb(as("HR_ADMIN"), "calibrate ratings", 100)).map(
      (r) => r.articleSlug,
    );
    expect(slugs).toContain("manager-playbook");
  });

  it("a too-short query returns nothing", async () => {
    expect(await searchKb(as("HR_ADMIN"), "a")).toEqual([]);
  });
});

describe("assistant access (super-admin policy)", () => {
  const SA = as("SUPER_ADMIN");
  const idBySlug = async (slug: string) =>
    (await prisma.hrDocument.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id;

  it("an assistant-disabled collection is excluded from the assistant but stays readable", async () => {
    // hr-internal is seeded assistant-off (sensitive). Even HR — whose tier allows
    // it — never retrieves its docs via the assistant…
    const hits = (await searchHandbook("salary bands midpoint", 50, as("HR_ADMIN"))).map(
      (h) => h.articleSlug,
    );
    expect(hits).not.toContain("compensation-bands");
    // …but the reader still shows it to HR (assistant-exclusion ≠ reader-exclusion).
    expect(await getArticle(as("HR_ADMIN"), "hr-internal", "compensation-bands")).not.toBeNull();
  });

  it("a per-document override hides one doc in an enabled collection", async () => {
    const id = await idBySlug("manager-playbook");
    await setDocumentAssistantAccess(SA, id, false);
    try {
      const off = (await searchHandbook("calibrate ratings", 50, as("MANAGER"))).map(
        (h) => h.articleSlug,
      );
      expect(off).not.toContain("manager-playbook");
    } finally {
      await setDocumentAssistantAccess(SA, id, null); // restore to inherit
    }
    const on = (await searchHandbook("calibrate ratings", 50, as("MANAGER"))).map(
      (h) => h.articleSlug,
    );
    expect(on).toContain("manager-playbook");
  });

  it("a per-document override can force a doc on inside a disabled collection", async () => {
    const id = await idBySlug("compensation-bands");
    await setDocumentAssistantAccess(SA, id, true); // override wins over collection-off
    try {
      const hits = (await searchHandbook("salary bands midpoint", 50, as("HR_ADMIN"))).map(
        (h) => h.articleSlug,
      );
      expect(hits).toContain("compensation-bands");
    } finally {
      await setDocumentAssistantAccess(SA, id, null); // back to inherit (off)
    }
  });

  it("refuses assistant-access changes without admin:settings", async () => {
    await expect(
      setCollectionAssistantAccess(as("HR_ADMIN"), "any-id", false),
    ).rejects.toThrow(/admin:settings/);
  });
});

describe("assistant override on the article form (admin:settings only)", () => {
  const colId = async () =>
    (await prisma.kbCollection.findUniqueOrThrow({
      where: { slug: "employee-handbook" },
      select: { id: true },
    })).id;
  const overrideOf = async (id: string) =>
    (await prisma.hrDocument.findUniqueOrThrow({
      where: { id },
      select: { assistantEnabled: true },
    })).assistantEnabled;

  it("a super admin can set the override at create", async () => {
    const doc = await createDocument(as("SUPER_ADMIN"), {
      slug: "tmp-sa-create",
      title: "Tmp",
      content: "<p>x</p>",
      collectionId: await colId(),
      visibility: "ALL_EMPLOYEES",
      assistantOverride: false,
    });
    try {
      expect(await overrideOf(doc.id)).toBe(false);
    } finally {
      await prisma.hrDocument.delete({ where: { id: doc.id } });
    }
  });

  it("an HR admin's edit cannot change the override (no clobber)", async () => {
    const doc = await createDocument(as("SUPER_ADMIN"), {
      slug: "tmp-hr-noclobber",
      title: "Tmp",
      content: "<p>x</p>",
      collectionId: await colId(),
      visibility: "ALL_EMPLOYEES",
      assistantOverride: false,
    });
    try {
      // Even if the field is submitted, lib re-checks admin:settings and ignores it.
      await updateDocument(as("HR_ADMIN"), doc.id, {
        slug: "tmp-hr-noclobber",
        title: "Tmp edited",
        content: "<p>y</p>",
        collectionId: await colId(),
        visibility: "ALL_EMPLOYEES",
        assistantOverride: true,
      });
      expect(await overrideOf(doc.id)).toBe(false); // unchanged
    } finally {
      await prisma.hrDocument.delete({ where: { id: doc.id } });
    }
  });

  it("a super admin's edit can change the override", async () => {
    const doc = await createDocument(as("SUPER_ADMIN"), {
      slug: "tmp-sa-update",
      title: "Tmp",
      content: "<p>x</p>",
      collectionId: await colId(),
      visibility: "ALL_EMPLOYEES",
    });
    try {
      expect(await overrideOf(doc.id)).toBeNull(); // inherit by default
      await updateDocument(as("SUPER_ADMIN"), doc.id, {
        slug: "tmp-sa-update",
        title: "Tmp",
        content: "<p>x</p>",
        collectionId: await colId(),
        visibility: "ALL_EMPLOYEES",
        assistantOverride: true,
      });
      expect(await overrideOf(doc.id)).toBe(true);
    } finally {
      await prisma.hrDocument.delete({ where: { id: doc.id } });
    }
  });
});

describe("KB admin defense in depth", () => {
  it("a non-kb:manage caller is refused even at the data layer", async () => {
    await expect(
      createDocument(as("EMPLOYEE"), {
        slug: "x",
        title: "x",
        content: "x",
        collectionId: "x",
        visibility: "ALL_EMPLOYEES",
      }),
    ).rejects.toThrow(/kb:manage/);
  });
});

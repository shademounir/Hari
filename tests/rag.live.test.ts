import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { searchHandbook } from "@/lib/rag";

// Live RAG test: embeds the query via OpenRouter, runs pgvector cosine search
// over the seeded handbook. Skips without a key or if the handbook isn't seeded.
const hasKey = !!process.env.OPENROUTER_API_KEY;
const d = hasKey ? describe : describe.skip;

d("RAG over the handbook (live embeddings via OpenRouter)", () => {
  afterAll(() => prisma.$disconnect());

  it("surfaces the most relevant section for a policy question", async () => {
    const seeded = await prisma.handbookChunk.count();
    if (seeded === 0) {
      console.warn("Handbook not seeded — run `npm run db:seed`. Skipping assertion.");
      return;
    }
    // HR admin sees every tier; the handbook is ALL_EMPLOYEES so any role works.
    const hits = await searchHandbook("what is the parental leave policy?", 3, {
      role: "HR_ADMIN",
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].section).toMatch(/parental/i);
    expect(hits[0].similarity).toBeGreaterThan(0.4);
    // Citations need an exact article + section deep-link target.
    expect(hits[0].articleSlug).toBeTruthy();
    expect(hits[0].collectionSlug).toBeTruthy();
  }, 30_000);
});

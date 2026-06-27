// Retrieval over the employee handbook using pgvector cosine distance (`<=>`)
// on the halfvec(384) column, accelerated by the HNSW index created in the
// Prisma migration (prisma/migrations/0_init); seed.ts only inserts rows.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

export type HandbookHit = {
  id: string;
  section: string;
  content: string;
  similarity: number; // 1 = identical, 0 = unrelated (cosine)
};

export async function searchHandbook(
  query: string,
  k = 4,
): Promise<HandbookHit[]> {
  const embedding = await embedText(query);
  const vec = toVectorLiteral(embedding);

  // `${vec}` is bound as a text param, then cast to halfvec. The ORDER BY uses
  // the HNSW index; we expose cosine *similarity* (1 - distance) for display.
  const rows = await prisma.$queryRaw<HandbookHit[]>(
    Prisma.sql`
      SELECT id, section, content,
             1 - (embedding <=> ${vec}::halfvec) AS similarity
      FROM "HandbookChunk"
      ORDER BY embedding <=> ${vec}::halfvec
      LIMIT ${k}
    `,
  );
  return rows;
}

// Hybrid retrieval over the knowledge base: semantic search (pgvector cosine on
// the halfvec(384) column, HNSW index) + lexical search (Postgres full-text over
// the generated `contentTsv`, GIN index), fused with Reciprocal Rank Fusion. The
// vector half catches paraphrase/synonyms; the lexical half catches exact terms
// (acronyms, names, IDs) embeddings miss. RRF fuses by RANK, so the two scores
// (cosine vs ts_rank) need no normalization.
//
// Authorization is enforced here in the query, not the prompt: only chunks of
// PUBLISHED documents whose visibility tier the caller may read are returned — the
// same "a tool can't see more than the UI" invariant as lib/hr.ts. Drafts and
// archived docs have no chunks (see lib/kb/ingest.ts); the status filter is
// belt-and-suspenders for any stale row.

import { sanitizeRetrievedContent } from "@/lib/ai/prompt-guard";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";
import { visibleDocTiers, type Role } from "@/lib/rbac";

export type HandbookHit = {
  id: string;
  section: string;
  anchor: string;
  content: string;
  similarity: number | null; // cosine (1 = identical); null for a lexical-only hit with no embedding
  articleTitle: string;
  articleSlug: string;
  collectionSlug: string;
};

// RRF constant — dampens the contribution of lower-ranked items (standard ≈ 60).
const RRF_K = 60;
// Candidate pool pulled from each signal before fusion (≫ k so fusion has room).
const CANDIDATES = 30;

export async function searchHandbook(
  query: string,
  k = 4,
  caller: { role: Role },
): Promise<HandbookHit[]> {
  const tiers = visibleDocTiers(caller.role);

  // The query embedding is BEST-EFFORT. If the embeddings endpoint hiccups
  // (transient 429/5xx, missing entitlement/credits, dimension mismatch), we must
  // NOT take the whole handbook down: the lexical (FTS) half needs no embeddings
  // and can still answer keyword-y policy questions. So we degrade to lexical-only
  // instead of throwing — symmetric with the keyless-safe ingest path. Only a
  // genuine DB failure below propagates (and is surfaced as { error } by the tool).
  let vec: string | null = null;
  try {
    vec = toVectorLiteral(await embedText(query));
  } catch (e) {
    console.warn("[rag] query embedding failed — falling back to lexical-only search:", e);
  }

  // For the lexical-only fallback we OR the query's word tokens rather than AND
  // them (which is what websearch_to_tsquery does). Without the vector half's
  // recall, a natural-language question like "parental leave policy" must still
  // surface the "Parental Leave" chunk even though no single chunk contains all
  // three words; ts_rank still ranks chunks matching more terms higher. Tokens are
  // reduced to letters/digits, so the string handed to to_tsquery is injection-safe.
  const orTerms = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1);

  // What the assistant may retrieve = the reader's gate (PUBLISHED + caller's
  // visible tiers) AND the super-admin assistant-access policy. The policy is
  // additive-only: a per-document override (true/false) wins over the collection
  // default, NULL inherits the collection — it can hide content from the assistant
  // but never widens access beyond status + visibility tier (see
  // docs/architecture/knowledge-base.md). `query` is bound as a text param to
  // websearch_to_tsquery (injection-safe).
  //
  // Gate the tier on the *document's* live `d.visibility` — the same column the
  // reader uses (lib/kb.ts) — NOT the denormalized `hc.visibility` copy. Re-ingest
  // isn't atomic with a visibility edit, so a chunk's copy can transiently (or, if a
  // re-embed fails, persistently) lag the document; reading `d.visibility` keeps
  // chat/search and the reader gate on exactly the same value. We already join
  // "HrDocument" here, so this costs nothing.
  const visible = Prisma.sql`d.status = 'PUBLISHED'
    AND d.visibility = ANY(${tiers}::"DocVisibility"[])
    AND COALESCE(d."assistantEnabled", col."assistantEnabled") = true`;

  const rows = vec
    ? await prisma.$queryRaw<HandbookHit[]>(
        Prisma.sql`
      WITH q AS (SELECT websearch_to_tsquery('simple', ${query}) AS query),
      vec AS (
        SELECT hc.id, row_number() OVER (ORDER BY hc.embedding <=> ${vec}::halfvec) AS rank
        FROM "HandbookChunk" hc
        JOIN "HrDocument" d ON d.id = hc."documentId"
        JOIN "KbCollection" col ON col.id = d."collectionId"
        WHERE ${visible} AND hc.embedding IS NOT NULL
        ORDER BY hc.embedding <=> ${vec}::halfvec
        LIMIT ${CANDIDATES}
      ),
      lex AS (
        SELECT hc.id,
               row_number() OVER (ORDER BY ts_rank_cd(hc."contentTsv", q.query) DESC) AS rank
        FROM "HandbookChunk" hc
        JOIN "HrDocument" d ON d.id = hc."documentId"
        JOIN "KbCollection" col ON col.id = d."collectionId"
        CROSS JOIN q
        WHERE ${visible} AND hc."contentTsv" @@ q.query
        ORDER BY ts_rank_cd(hc."contentTsv", q.query) DESC
        LIMIT ${CANDIDATES}
      ),
      fused AS (
        SELECT COALESCE(vec.id, lex.id) AS id,
               COALESCE(1.0 / (${RRF_K} + vec.rank), 0)
             + COALESCE(1.0 / (${RRF_K} + lex.rank), 0) AS score
        FROM vec FULL OUTER JOIN lex ON vec.id = lex.id
      )
      SELECT hc.id, hc.section, hc.anchor, hc.content,
             CASE WHEN hc.embedding IS NULL THEN NULL
                  ELSE 1 - (hc.embedding <=> ${vec}::halfvec) END AS similarity,
             d.title AS "articleTitle",
             d.slug AS "articleSlug",
             col.slug AS "collectionSlug"
      FROM fused
      JOIN "HandbookChunk" hc ON hc.id = fused.id
      JOIN "HrDocument" d ON d.id = hc."documentId"
      JOIN "KbCollection" col ON col.id = d."collectionId"
      ORDER BY fused.score DESC
      LIMIT ${k}
    `,
      )
    : // Lexical-only fallback (no usable query embedding). Pure Postgres FTS — no
      // vector operations — so a handbook question still resolves as long as any
      // keyword matches. `similarity` is NULL (there was no vector to compare).
      orTerms.length === 0
      ? [] // nothing searchable (query was only stopwords/short tokens)
      : await prisma.$queryRaw<HandbookHit[]>(
          Prisma.sql`
      WITH q AS (SELECT to_tsquery('simple', ${orTerms.join(" | ")}) AS query)
      SELECT hc.id, hc.section, hc.anchor, hc.content,
             NULL::float8 AS similarity,
             d.title AS "articleTitle",
             d.slug AS "articleSlug",
             col.slug AS "collectionSlug"
      FROM "HandbookChunk" hc
      JOIN "HrDocument" d ON d.id = hc."documentId"
      JOIN "KbCollection" col ON col.id = d."collectionId"
      CROSS JOIN q
      WHERE ${visible} AND hc."contentTsv" @@ q.query
      ORDER BY ts_rank_cd(hc."contentTsv", q.query) DESC
      LIMIT ${k}
    `,
        );

  return rows.map((row: HandbookHit) => ({
    ...row,
    content: sanitizeRetrievedContent(row.content),
  }));
}
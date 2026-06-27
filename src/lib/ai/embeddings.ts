// RAG embeddings via OpenRouter's OpenAI-compatible /embeddings endpoint.
//
// The model is env-selectable (EMBEDDING_MODEL). The DIMENSION, however, is part
// of the database schema — the `halfvec(384)` column lives in a Prisma migration.
// So you can freely swap to any other 384-dim model via env; to use a model with
// a DIFFERENT dimension, add a migration that ALTERs the column + rebuilds the
// HNSW index, then update EMBEDDING_DIMENSIONS. The runtime check in embed()
// fails loudly if the selected model's output width doesn't match the column.
//
// Dimensions for reference: all-minilm-l6-v2 / paraphrase-minilm-l6-v2 = 384,
// bge-base-en-v1.5 = 768, bge-m3 = 1024, text-embedding-3-small = 1536.
const MODEL = process.env.EMBEDDING_MODEL ?? "sentence-transformers/all-minilm-l6-v2";
export const EMBEDDING_DIMENSIONS = 384;

type EmbeddingResponse = {
  data?: { embedding: number[]; index: number }[];
  error?: { message?: string } | string;
};

// Returns embeddings in input order. Throws a clear error on any unexpected
// shape (OpenRouter can return a 200 with an error body) or dimension mismatch.
async function embed(input: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input }),
  });

  const body = (await res.json().catch(() => null)) as EmbeddingResponse | null;
  if (!res.ok || !body || !Array.isArray(body.data)) {
    const detail =
      (body && (typeof body.error === "string" ? body.error : body.error?.message)) ??
      `HTTP ${res.status}`;
    throw new Error(`OpenRouter embeddings failed: ${detail}`);
  }
  if (body.data.length !== input.length) {
    throw new Error(
      `OpenRouter embeddings returned ${body.data.length} vectors for ${input.length} inputs`,
    );
  }

  const ordered = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of ordered) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: model "${MODEL}" returned ${v?.length} dims, ` +
          `but the DB column is halfvec(${EMBEDDING_DIMENSIONS}). Pick a ${EMBEDDING_DIMENSIONS}-dim ` +
          `model, or add a migration to change the column + update EMBEDDING_DIMENSIONS.`,
      );
    }
  }
  return ordered;
}

export async function embedText(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return embed(texts);
}

/** pgvector literal, e.g. "[0.1,0.2,...]" — cast to ::halfvec in SQL. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

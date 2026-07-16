// ─────────────────────────────────────────────────────────────────────────
// AI observability (SCRUM-062). The single write path for AiEvent — a
// metadata-only trace of AI interactions. NEVER pass prompt/response text,
// employee names, or salary here: store role, model, token counts, latency,
// and stable codes only, so tracing can't leak sensitive HR data.
//
// Recording is best-effort: it must never throw into or block the chat stream,
// so every write is wrapped and failures are logged, not propagated.
// ─────────────────────────────────────────────────────────────────────────
import type { AiEventKind, Prisma } from "@prisma/client";
import type { Role } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export type RecordAiEventInput = {
  conversationId: string;
  role: Role;
  kind: AiEventKind;
  userId?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  stepCount?: number | null;
  finishReason?: string | null;
  toolName?: string | null;
  errorCode?: string | null;
  guardRule?: string | null;
  reasonCode?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

/**
 * Persist one AI event. Returns the created row's id (for linking an Alert to
 * its originating event) or null if the write failed — callers must tolerate
 * null and never await this in a way that stalls the response.
 */
export async function recordAiEvent(input: RecordAiEventInput): Promise<string | null> {
  try {
    const { meta, ...rest } = input;
    const row = await prisma.aiEvent.create({
      data: {
        ...rest,
        meta: meta ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[aiEvent] record failed:", err);
    return null;
  }
}

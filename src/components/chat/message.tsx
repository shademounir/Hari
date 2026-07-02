"use client";

import { memo, useMemo } from "react";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { Reasoning } from "./reasoning";
import { ToolCall } from "./tool-call";
import { EndConversation } from "./generative/end-conversation";
import { Markdown } from "./markdown";
import type { CitationTarget } from "./citations-rehype";

// Memoized so streaming a token into the last message doesn't re-render (and
// re-parse the markdown of) every prior message in the conversation.
export const ChatMessage = memo(function ChatMessage({
  message,
  streaming,
}: {
  message: UIMessage;
  streaming: boolean;
}) {
  const tChat = useTranslations("chat");
  const tCommon = useTranslations("common");
  const isUser = message.role === "user";
  // Reasoning is "live" only until visible answer text starts arriving.
  const hasAnswerText = message.parts.some(
    (p) => p.type === "text" && p.text.length > 0,
  );

  // Map citation numbers → exact-section URLs from this message's searchHandbook
  // results, so inline [n] markers in the answer become deep links. Built from the
  // tool output (DB-derived URLs), never from model-authored text.
  const citations = useMemo(() => {
    const m = new Map<number, CitationTarget>();
    for (const part of message.parts) {
      if (
        part.type === "tool-searchHandbook" &&
        "output" in part &&
        part.output &&
        Array.isArray((part.output as { results?: unknown }).results)
      ) {
        for (const r of (part.output as { results: { ref: number; url: string }[] }).results) {
          if (typeof r?.ref === "number" && typeof r?.url === "string") {
            m.set(r.ref, { url: r.url });
          }
        }
      }
    }
    return m;
  }, [message.parts]);

  return (
    <div
      role="group"
      aria-label={isUser ? tCommon("you") : tChat("assistantLabel")}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-muted" : "bg-primary text-primary-foreground",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          "min-w-0 space-y-2",
          // Assistant column is a stable full width so tool cards don't reflow as
          // tokens stream; the user's bubble stays content-sized and right-aligned.
          isUser ? "flex max-w-[85%] flex-col items-end" : "flex-1",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text) return null;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm leading-relaxed",
                  isUser
                    ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "w-fit max-w-full bg-muted",
                )}
              >
                {isUser ? part.text : <Markdown citations={citations}>{part.text}</Markdown>}
              </div>
            );
          }

          if (part.type === "reasoning") {
            if (!part.text) return null;
            return (
              <Reasoning
                key={i}
                text={part.text}
                streaming={streaming && !hasAnswerText}
              />
            );
          }

          if (part.type.startsWith("tool-")) {
            return <ToolCall key={i} part={part as never} streaming={streaming} />;
          }

          // The input guard's "conversation closed" signal (no tool call).
          if (part.type === "data-conversationClosed") {
            const reason = (part as { data?: { reason?: string } }).data?.reason;
            return <EndConversation key={i} reason={reason} />;
          }

          return null;
        })}
      </div>
    </div>
  );
});

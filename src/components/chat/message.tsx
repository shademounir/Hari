"use client";

import { memo } from "react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { Reasoning } from "./reasoning";
import { ToolCall } from "./tool-call";
import { Markdown } from "./markdown";

// Memoized so streaming a token into the last message doesn't re-render (and
// re-parse the markdown of) every prior message in the conversation.
export const ChatMessage = memo(function ChatMessage({
  message,
  streaming,
}: {
  message: UIMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  // Reasoning is "live" only until visible answer text starts arriving.
  const hasAnswerText = message.parts.some(
    (p) => p.type === "text" && p.text.length > 0,
  );

  return (
    <div
      role="group"
      aria-label={isUser ? "You" : "Assistant"}
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
                {isUser ? part.text : <Markdown>{part.text}</Markdown>}
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

          return null;
        })}
      </div>
    </div>
  );
});

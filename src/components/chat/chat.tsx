"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Square, Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { CHAT_MODELS, DEFAULT_MODEL_ID } from "@/lib/ai/providers";
import { type Role } from "@/lib/rbac";
import { ChatMessage } from "./message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUGGESTION_KEYS = [
  "suggestion1",
  "suggestion2",
  "suggestion3",
  "suggestion4",
] as const;

export function Chat({ user }: { user: { name: string; role: Role } }) {
  const t = useTranslations("chat");
  const tRoles = useTranslations("roles");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value }, { body: { modelId } });
    setInput("");
    inputRef.current?.focus(); // keep keyboard focus in the composer
  }

  return (
    <div className="flex h-full flex-col">
      {/* Model selector */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Bot className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{t("assistant")}</span>
          <Badge variant="secondary" className="shrink-0">{tRoles(user.role)}</Badge>
        </div>
        <Select value={modelId} onValueChange={(v) => v && setModelId(v)}>
          <SelectTrigger className="w-[150px] shrink-0 sm:w-[220px]" size="sm" aria-label={t("modelLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAT_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label} · {m.provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          role="log"
          aria-live="polite"
          aria-label={t("conversation")}
          className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6"
        >
          {messages.length === 0 && (
            <div className="space-y-4 pt-10 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t("greeting", { name: user.name.split(" ")[0] })}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("greetingDescription")}
                </p>
              </div>
              <div className="mx-auto grid max-w-md gap-2 sm:grid-cols-2">
                {SUGGESTION_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => submit(t(key))}
                    className="rounded-lg border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              streaming={busy && i === messages.length - 1}
            />
          ))}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {t("error")}
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter newlines. Skip while an IME is composing.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(input);
              }
            }}
            aria-label={t("messageLabel")}
            placeholder={t("placeholder")}
            rows={1}
            className="max-h-40 min-h-[44px] resize-none"
          />
          {busy ? (
            <Button
              size="icon"
              variant="secondary"
              onClick={() => stop()}
              aria-label={t("stop")}
              className="size-11 shrink-0"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={() => submit(input)}
              disabled={!input.trim()}
              aria-label={t("send")}
              className="size-11 shrink-0"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

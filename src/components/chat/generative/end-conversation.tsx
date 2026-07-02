"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

// Close reasons with a localized label (chat.closed.reason.<x>) — mirrors the
// set in chat.tsx. An unknown value falls back to the generic body text.
const CLOSE_REASONS = new Set([
  "ABUSE",
  "DISALLOWED_REQUEST",
  "SAFETY",
  "OFF_TOPIC_PERSISTENT",
  "oversize",
  "prompt_injection",
  "system_exfiltration",
]);

/**
 * Inline card shown in the transcript when the assistant ends the chat via the
 * endConversation tool. The composer lock (chat.tsx) is the primary signal; this
 * gives the turn itself a visible marker. Reason is a code — never PII.
 */
export function EndConversation({ reason }: { reason?: string }) {
  const t = useTranslations("chat.closed");
  const label = reason && CLOSE_REASONS.has(reason) ? t(`reason.${reason}` as never) : t("body");
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs text-muted-foreground">
      <Lock className="size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{t("title")}</span> — {label}
      </span>
    </div>
  );
}

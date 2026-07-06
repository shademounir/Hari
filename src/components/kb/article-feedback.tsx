"use client";

import { useState, useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { articleFeedbackAction } from "@/app/(dashboard)/kb/actions";

// "Was this helpful?" 👍/👎 for an article. Optimistic: highlights the chosen vote
// immediately, persists via the server action, and confirms with a toast.
export function ArticleFeedback({
  documentId,
  initialVote,
}: {
  documentId: string;
  initialVote: boolean | null;
}) {
  const t = useTranslations("kb");
  const [vote, setVote] = useState<boolean | null>(initialVote);
  const [pending, start] = useTransition();

  const cast = (helpful: boolean) =>
    start(async () => {
      const previous = vote;
      setVote(helpful); // optimistic
      const ok = await articleFeedbackAction(documentId, helpful);
      if (ok) {
        toast.success(t("feedbackThanks"));
      } else {
        setVote(previous); // rejected (e.g. doc unpublished) — revert + tell the user
        toast.error(t("feedbackFailed"));
      }
    });

  return (
    <div className="mt-8 flex items-center gap-3 border-t pt-5 text-sm">
      <span className="text-muted-foreground">{t("wasThisHelpful")}</span>
      <Button
        type="button"
        size="xs"
        variant={vote === true ? "default" : "outline"}
        disabled={pending}
        aria-label={t("helpfulYes")}
        aria-pressed={vote === true}
        onClick={() => cast(true)}
      >
        <ThumbsUp className="size-3.5" /> {t("helpfulYes")}
      </Button>
      <Button
        type="button"
        size="xs"
        variant={vote === false ? "default" : "outline"}
        disabled={pending}
        aria-label={t("helpfulNo")}
        aria-pressed={vote === false}
        onClick={() => cast(false)}
      >
        <ThumbsDown className="size-3.5" /> {t("helpfulNo")}
      </Button>
    </div>
  );
}

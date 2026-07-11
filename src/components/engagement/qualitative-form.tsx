"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ClipboardPen, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { saveQualitativeSignalAction } from "@/app/(dashboard)/team/engagement/actions";

type Field = "workQuality" | "participation" | "peerInteraction";
const FIELDS: Field[] = ["workQuality", "participation", "peerInteraction"];

// A quick monthly rating a manager submits for one report. Feeds the qualitative
// half of the engagement score (SCRUM-099). Manager-only + ownership-checked in
// the server action; this island just collects 3 × 1–5 ratings + an optional note.
export function QualitativeForm({ employeeId, name }: { employeeId: string; name: string }) {
  const t = useTranslations("engagement.qualitative");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<Field, number>>({
    workQuality: 3,
    participation: 3,
    peerInteraction: 3,
  });
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (pending) return;
    startTransition(async () => {
      const res = await saveQualitativeSignalAction({ employeeId, ...ratings, note: note.trim() || null });
      if (res.ok) {
        toast.success(t("saved"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(t("errorTitle"), { description: t(`error.${res.error}`) });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-xs" />}>
        <ClipboardPen className="size-3.5" />
        {t("rate")}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" />}>
          <X className="size-4" />
          <span className="sr-only">{t("cancel")}</span>
        </DialogClose>

        <div className="border-b p-4 pr-10">
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </div>

        <div className="space-y-4 p-4">
          {FIELDS.map((f) => (
            <div key={f}>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{t(f)}</label>
                <span className="text-xs text-muted-foreground">{ratings[f]} / 5</span>
              </div>
              <div className="inline-flex gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={ratings[f] === v}
                    aria-label={`${t(f)}: ${v}`}
                    onClick={() => setRatings((r) => ({ ...r, [f]: v }))}
                    className={cn(
                      "size-8 rounded-lg border text-sm font-medium tabular-nums transition-colors",
                      ratings[f] === v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t("note")}</label>
            <Textarea
              value={note}
              maxLength={500}
              rows={2}
              placeholder={t("notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("notePrivacy")}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <DialogClose render={<Button variant="ghost" size="sm" />}>{t("cancel")}</DialogClose>
          <Button size="sm" className="gap-1.5" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

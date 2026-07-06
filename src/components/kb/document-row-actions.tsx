"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type ServerAction = (formData: FormData) => void | Promise<void>;
type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// Per-row lifecycle menu for a KB document: collapses Edit / Publish · Unpublish /
// Archive / Delete into one kebab so the admin table stays scannable. Reversible
// actions toast in place; Delete restates the consequence in a confirm dialog.
export function DocumentRowActions({
  doc,
  publish,
  unpublish,
  archive,
  remove,
}: {
  doc: { id: string; title: string; status: Status };
  publish: ServerAction;
  unpublish: ServerAction;
  archive: ServerAction;
  remove: ServerAction;
}) {
  const t = useTranslations("kb");
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = (action: ServerAction, message: string, after?: () => void) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", doc.id);
      await action(fd);
      toast.success(message);
      after?.();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("rowActions")} />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem render={<Link href={`/kb/admin/documents/${doc.id}`} />}>
            {t("edit")}
          </DropdownMenuItem>
          {doc.status !== "PUBLISHED" && (
            <DropdownMenuItem
              disabled={pending}
              onClick={() => run(publish, t("toastPublished"))}
            >
              {t("publish")}
            </DropdownMenuItem>
          )}
          {doc.status === "PUBLISHED" && (
            <DropdownMenuItem
              disabled={pending}
              onClick={() => run(unpublish, t("toastUnpublished"))}
            >
              {t("unpublish")}
            </DropdownMenuItem>
          )}
          {doc.status !== "ARCHIVED" && (
            <DropdownMenuItem
              disabled={pending}
              onClick={() => run(archive, t("toastArchived"))}
            >
              {t("archive")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 text-sm shadow-lg transition-all data-ending-style:opacity-0 data-starting-style:opacity-0">
            <AlertDialog.Title className="text-base font-semibold">
              {t("deleteDocTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-muted-foreground">
              {t("deleteDocDesc", { title: doc.title })}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Close render={<Button type="button" size="sm" variant="ghost" />}>
                {t("cancel")}
              </AlertDialog.Close>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(remove, t("toastDeleted"), () => setConfirmOpen(false))}
              >
                {t("confirmDelete")}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

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

// Kebab row menu for a KB collection (Edit / Delete) — same affordance as the
// document rows so the admin tables read consistently. Delete cascades to the
// collection's documents, so it confirms first.
export function CollectionRowActions({
  collection,
  remove,
}: {
  collection: { id: string; name: string };
  remove: ServerAction;
}) {
  const t = useTranslations("kb");
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirm = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", collection.id);
      await remove(fd);
      toast.success(t("toastDeleted"));
      setConfirmOpen(false);
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
          <DropdownMenuItem render={<Link href={`/kb/admin/collections/${collection.id}`} />}>
            {t("edit")}
          </DropdownMenuItem>
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
              {t("deleteCollectionTitle")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-muted-foreground">
              {t("deleteCollectionDesc", { name: collection.name })}
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
                onClick={onConfirm}
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteRoleAction } from "@/app/(dashboard)/settings/roles/actions";

// Matches the KB admin row-action pattern (components/kb/document-row-actions.tsx):
// the transition lives here, so `pending` is per-row.
export function RoleRowActions({
  slug,
  label,
  deletable,
  inUse,
}: {
  slug: string;
  label: string;
  /** False for a built-in, or a role someone still holds. */
  deletable: boolean;
  inUse: boolean;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onDelete() {
    start(async () => {
      const res = await deleteRoleAction(slug);
      // Always close the dialog, so a failure can't leave it stuck open with no
      // feedback behind it.
      setConfirmOpen(false);
      if (res.ok) {
        toast.success(t("roleDeleted"));
        router.refresh();
      } else {
        toast.error(t(`error.${res.error}`));
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("editRole")} />}
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/settings/roles/${slug}`} />}>
            {t("editRole")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!deletable}
            onClick={() => setConfirmOpen(true)}
          >
            {t("deleteRole")}
          </DropdownMenuItem>
          {/* Say WHY it's unavailable, and what would make it available. */}
          {!deletable && (
            <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
              {inUse ? t("error.role_in_use") : t("error.builtin_immutable")}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t("deleteRoleConfirm", { label })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteRoleBody")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" size="sm" variant="ghost" />}>
              {tCommon("cancel")}
            </AlertDialogClose>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={onDelete}
            >
              {t("deleteRole")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

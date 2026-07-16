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
import {
  resendInviteAction,
  setUserActiveAction,
  type UserActionResult,
} from "@/app/(dashboard)/settings/users/actions";

export function UserRowActions({
  userId,
  name,
  active,
  isSelf,
  pendingInvite,
}: {
  userId: string;
  name: string;
  active: boolean;
  /** You can't deactivate yourself — the server refuses it too. */
  isSelf: boolean;
  pendingInvite: boolean;
}) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handle(res: UserActionResult, successMsg: string) {
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error(t(`userError.${res.error}`));
    }
  }

  function onSetActive(next: boolean) {
    start(async () => {
      const res = await setUserActiveAction(userId, next);
      // Always close, so a refusal can't leave the dialog stuck open behind a toast.
      setConfirmOpen(false);
      handle(res, next ? t("reactivated") : t("deactivated"));
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("editPerson")} />}
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/settings/users/${userId}`} />}>
            {t("editPerson")}
          </DropdownMenuItem>
          {pendingInvite && (
            <DropdownMenuItem
              disabled={pending}
              onClick={() =>
                start(async () => handle(await resendInviteAction(userId), t("inviteResent")))
              }
            >
              {t("resendInvite")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {active ? (
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf || pending}
              onClick={() => setConfirmOpen(true)}
            >
              {t("deactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={pending} onClick={() => onSetActive(true)}>
              {t("reactivate")}
            </DropdownMenuItem>
          )}
          {isSelf && active && (
            <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
              {t("userError.self_forbidden")}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t("deactivateConfirm", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deactivateBody")}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" size="sm" variant="ghost" />}>
              {tCommon("cancel")}
            </AlertDialogClose>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => onSetActive(false)}
            >
              {t("deactivate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

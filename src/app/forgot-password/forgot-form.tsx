"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requestPasswordResetAction, type ForgotState } from "./actions";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<ForgotState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <form action={action} className="grid gap-3">
      <Input name="email" type="email" required placeholder={t("emailPlaceholder")} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.sent && <p className="text-sm text-emerald-600">{t("checkEmail")}</p>}
      {state.devLink && (
        <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-xs break-all">
          <span className="font-medium">{t("devLinkNote")} </span>
          <a className="text-primary underline" href={state.devLink}>
            {state.devLink}
          </a>
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t("sending") : t("sendResetLink")}
      </Button>
    </form>
  );
}

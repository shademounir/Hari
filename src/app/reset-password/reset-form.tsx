"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resetPasswordAction, type ResetState } from "./actions";

export function ResetForm({ email, token }: { email: string; token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      <Input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder={t("newPassword")}
        aria-label={t("newPassword")}
      />
      <Input
        name="confirm"
        type="password"
        required
        minLength={8}
        placeholder={t("confirmPassword")}
        aria-label={t("confirmPassword")}
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("resetSubmit")}
      </Button>
    </form>
  );
}

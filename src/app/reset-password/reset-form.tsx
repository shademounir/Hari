"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resetPasswordAction, type ResetState } from "./actions";

export function ResetForm({
  email,
  token,
  invite = false,
}: {
  email: string;
  token: string;
  /** True when this link came from an invite — sets the FIRST password. */
  invite?: boolean;
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      {/* The server narrows this to PASSWORD_RESET | INVITE — a sign-in secret
          (magic link / OTP) can never be spent on a password change. */}
      <input type="hidden" name="kind" value={invite ? "INVITE" : "PASSWORD_RESET"} />
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
        {pending ? t("saving") : invite ? t("welcomeSubmit") : t("resetSubmit")}
      </Button>
    </form>
  );
}

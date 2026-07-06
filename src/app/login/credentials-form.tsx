"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginWithCredentials } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CredentialsForm() {
  const t = useTranslations("login");
  const [state, formAction, pending] = useActionState(loginWithCredentials, {});

  const errorId = "login-error";
  const describedBy = state?.error ? errorId : undefined;

  return (
    <form action={formAction} className="grid gap-3">
      <Input
        name="email"
        type="email"
        aria-label={t("email")}
        placeholder={t("emailPlaceholder")}
        required
        aria-invalid={!!state?.error}
        aria-describedby={describedBy}
      />
      <Input
        name="password"
        type="password"
        aria-label={t("password")}
        placeholder={t("passwordPlaceholder")}
        required
        aria-invalid={!!state?.error}
        aria-describedby={describedBy}
      />
      {state?.error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}

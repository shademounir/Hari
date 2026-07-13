"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, KeyRound, LinkIcon } from "lucide-react";
import {
  requestMagicLinkAction,
  requestOtpAction,
  verifyOtpAction,
  signInWithGoogleAction,
  type RequestState,
} from "./passwordless-actions";

type Method = "magic" | "otp" | null;

export function AltAuth({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const [method, setMethod] = useState<Method>(null);

  return (
    <div className="space-y-3">
      {googleEnabled && (
        <form action={signInWithGoogleAction}>
          <Button type="submit" variant="outline" className="w-full">
            {t("continueWithGoogle")}
          </Button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={method === "magic" ? "secondary" : "outline"}
          className="w-full"
          onClick={() => setMethod(method === "magic" ? null : "magic")}
        >
          <LinkIcon className="size-4" /> {t("magicLink")}
        </Button>
        <Button
          type="button"
          variant={method === "otp" ? "secondary" : "outline"}
          className="w-full"
          onClick={() => setMethod(method === "otp" ? null : "otp")}
        >
          <Mail className="size-4" /> {t("emailCode")}
        </Button>
      </div>

      {method === "magic" && <MagicLinkForm />}
      {method === "otp" && <OtpFlow />}
    </div>
  );
}

function DevReveal({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-xs break-all">
      <span className="font-medium">{label} </span>
      {value.startsWith("http") ? (
        <a className="text-primary underline" href={value}>
          {value}
        </a>
      ) : (
        <code className="font-mono">{value}</code>
      )}
    </p>
  );
}

function MagicLinkForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<RequestState, FormData>(
    requestMagicLinkAction,
    {},
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{t("magicLinkHint")}</p>
      <Input name="email" type="email" required aria-label={t("email")} placeholder={t("emailPlaceholder")} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.sent && <p className="text-sm text-emerald-600">{t("checkEmail")}</p>}
      {state.devLink && <DevReveal label={t("devLinkNote")} value={state.devLink} />}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("sending") : t("sendMagicLink")}
      </Button>
    </form>
  );
}

function OtpFlow() {
  const t = useTranslations("auth");
  const [reqState, reqAction, reqPending] = useActionState<RequestState, FormData>(
    requestOtpAction,
    {},
  );
  const [verState, verAction, verPending] = useActionState<{ error?: string }, FormData>(
    verifyOtpAction,
    {},
  );
  const [email, setEmail] = useState("");

  if (!reqState.sent) {
    return (
      <form action={reqAction} className="grid gap-2 rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{t("emailCodeHint")}</p>
        <Input
          name="email"
          type="email"
          required
          aria-label={t("email")}
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {reqState.error && <p className="text-sm text-destructive">{reqState.error}</p>}
        <Button type="submit" size="sm" disabled={reqPending}>
          {reqPending ? t("sending") : t("sendCode")}
        </Button>
      </form>
    );
  }

  return (
    <form action={verAction} className="grid gap-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{t("enterCodeHint", { email })}</p>
      <input type="hidden" name="email" value={email} />
      {reqState.devCode && <DevReveal label={t("devCodeNote")} value={reqState.devCode} />}
      <Input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        aria-label={t("codeLabel")}
        placeholder="000000"
        className="text-center tracking-[0.4em]"
      />
      {verState.error && <p className="text-sm text-destructive">{verState.error}</p>}
      <Button type="submit" size="sm" disabled={verPending}>
        <KeyRound className="size-4" /> {verPending ? t("verifying") : t("verifyCode")}
      </Button>
    </form>
  );
}

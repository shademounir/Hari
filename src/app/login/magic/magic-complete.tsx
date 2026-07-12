"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { completeMagicLinkAction } from "../passwordless-actions";

// Fires the one-time sign-in exactly once on mount. On success the server action
// redirects to /; on failure it returns an error we surface with a way back.
export function MagicComplete({ email, token }: { email: string; token: string }) {
  const t = useTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeMagicLinkAction(email, token)
      .then((res) => {
        if (res?.error) setError(res.error);
      })
      .catch(() => setError(t("linkInvalid")));
  }, [email, token, t]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/login" className="text-sm text-primary underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {t("magicVerifying")}
    </p>
  );
}

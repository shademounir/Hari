"use server";

import { getTranslations } from "next-intl/server";
import { issuePasswordReset } from "@/lib/auth/flows";

export type ForgotState = { sent?: boolean; error?: string; devLink?: string };

// Always reports "sent" (anti-enumeration). In dev the reset link is surfaced.
export async function requestPasswordResetAction(
  _prev: ForgotState | undefined,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "");
  if (!email.includes("@")) {
    const t = await getTranslations("auth");
    return { error: t("invalidEmail") };
  }
  const res = await issuePasswordReset(email);
  return { sent: true, devLink: res.devLink };
}

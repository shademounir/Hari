"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { verifyAuthToken, normalizeEmail } from "@/lib/auth/tokens";

export type ResetState = { error?: string };

export async function resetPasswordAction(
  _prev: ResetState | undefined,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  // An invite sets the FIRST password; a reset replaces one. Same one-time-token
  // mechanic, different copy — so the kind rides on the form and is narrowed to
  // the two that may set a password here (never MAGIC_LINK / EMAIL_OTP, which are
  // sign-in secrets and must not be spendable on a password change).
  const kind = String(formData.get("kind") ?? "") === "INVITE" ? "INVITE" : "PASSWORD_RESET";
  const t = await getTranslations("auth");

  if (password.length < 8) return { error: t("passwordTooShort") };
  if (password !== confirm) return { error: t("passwordMismatch") };

  const res = await verifyAuthToken(kind, email, token);
  if (!res.ok) {
    return { error: res.reason === "expired" ? t("linkExpired") : t("linkInvalid") };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email: normalizeEmail(email) },
    data: {
      passwordHash,
      // Consuming an invite proves the address, exactly as the passwordless
      // providers treat their first successful confirm.
      ...(kind === "INVITE" ? { emailVerified: new Date() } : {}),
    },
  });
  redirect(kind === "INVITE" ? "/login?welcome=1" : "/login?reset=1");
}

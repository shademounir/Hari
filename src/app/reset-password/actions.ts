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
  const t = await getTranslations("auth");

  if (password.length < 8) return { error: t("passwordTooShort") };
  if (password !== confirm) return { error: t("passwordMismatch") };

  const res = await verifyAuthToken("PASSWORD_RESET", email, token);
  if (!res.ok) {
    return { error: res.reason === "expired" ? t("linkExpired") : t("linkInvalid") };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { email: normalizeEmail(email) },
    data: { passwordHash },
  });
  redirect("/login?reset=1");
}

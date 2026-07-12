"use server";

import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/lib/auth";
import { issueMagicLink, issueEmailOtp } from "@/lib/auth/flows";

// ── Request forms (email in) ────────────────────────────────────────────────
// Both always return a generic "sent" so an attacker can't probe which emails
// exist. In dev, the link/code is surfaced (devLink / devCode) for demoing.

export type RequestState = { sent?: boolean; error?: string; devLink?: string; devCode?: string };

export async function requestMagicLinkAction(
  _prev: RequestState | undefined,
  formData: FormData,
): Promise<RequestState> {
  const email = String(formData.get("email") ?? "");
  if (!email.includes("@")) {
    const t = await getTranslations("auth");
    return { error: t("invalidEmail") };
  }
  const res = await issueMagicLink(email);
  return { sent: true, devLink: res.devLink };
}

export async function requestOtpAction(
  _prev: RequestState | undefined,
  formData: FormData,
): Promise<RequestState> {
  const email = String(formData.get("email") ?? "");
  if (!email.includes("@")) {
    const t = await getTranslations("auth");
    return { error: t("invalidEmail") };
  }
  const res = await issueEmailOtp(email);
  return { sent: true, devCode: res.devSecret };
}

// ── Completion (secret in → sign in) ────────────────────────────────────────

export async function verifyOtpAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  try {
    await signIn("passwordless", {
      email,
      secret: code,
      kind: "EMAIL_OTP",
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const t = await getTranslations("auth");
      return { error: t("invalidCode") };
    }
    throw err; // redirect() throws — let it propagate
  }
}

/** Called by the magic-link landing page to complete sign-in. */
export async function completeMagicLinkAction(
  email: string,
  token: string,
): Promise<{ error?: string }> {
  try {
    await signIn("passwordless", {
      email,
      secret: token,
      kind: "MAGIC_LINK",
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const t = await getTranslations("auth");
      return { error: t("linkInvalid") };
    }
    throw err;
  }
}

export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

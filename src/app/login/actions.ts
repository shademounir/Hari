"use server";

import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { signIn } from "@/lib/auth";
import { getDemoPassword, isDemoLoginEnabled } from "@/lib/demo-users";

// Manual email/password login (the form at the bottom of the card).
export async function loginWithCredentials(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      const t = await getTranslations("login");
      return { error: t("invalidCredentials") };
    }
    throw err; // redirect() throws — let it propagate
  }
}

// One-click "login as <role>" — strictly limited to local/demo environments.
export async function loginAs(email: string): Promise<void> {
  if (!isDemoLoginEnabled()) {
    throw new Error("Demo one-click login is disabled in this environment.");
  }

  await signIn("credentials", {
    email,
    password: getDemoPassword(),
    redirectTo: "/",
  });
}

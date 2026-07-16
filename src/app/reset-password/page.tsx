import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getApiCaller } from "@/lib/session";
import { HariLogo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; kind?: string }>;
}) {
  // Bounce an already-signed-in visitor to the dashboard — but ask lib/session,
  // not auth(). A deactivated (or deleted) user still holds a VALID JWT: auth()
  // would say "signed in", we would send them to /, requireUser() would find no
  // caller and send them back here — an infinite redirect. The resolved caller is
  // the only honest answer to "are you signed in".
  if (await getApiCaller()) redirect("/");
  const { email = "", token = "", kind } = await searchParams;
  // An invite and a reset share the one-time-token mechanic but not the story:
  // one is "welcome, pick a password", the other "you asked to change yours".
  const invite = kind === "INVITE";
  const t = await getTranslations("auth");

  const invalid = !email || !token;

  return (
    <main className="relative grid min-h-dvh place-items-center p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <HariLogo />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{invite ? t("welcomeTitle") : t("resetTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {invalid
              ? t("resetMissingParams")
              : invite
                ? t("welcomeDescription")
                : t("resetDescription")}
          </p>
        </div>
        {!invalid && <ResetForm email={email} token={token} invite={invite} />}
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}

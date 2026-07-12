import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { HariLogo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  if ((await auth())?.user) redirect("/");
  const { email = "", token = "" } = await searchParams;
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
          <h1 className="text-2xl font-semibold">{t("resetTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {invalid ? t("resetMissingParams") : t("resetDescription")}
          </p>
        </div>
        {!invalid && <ResetForm email={email} token={token} />}
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}

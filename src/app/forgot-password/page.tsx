import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { HariLogo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ForgotForm } from "./forgot-form";

export default async function ForgotPasswordPage() {
  if ((await auth())?.user) redirect("/");
  const t = await getTranslations("auth");

  return (
    <main className="relative grid min-h-dvh place-items-center p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <HariLogo />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{t("forgotTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("forgotDescription")}</p>
        </div>
        <ForgotForm />
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary underline">
            {t("backToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}

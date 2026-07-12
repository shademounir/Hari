import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { HariLogo } from "@/components/brand/logo";
import { MagicComplete } from "./magic-complete";

export default async function MagicLinkPage({
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
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <HariLogo />
        </div>
        <h1 className="text-2xl font-semibold">{t("magicTitle")}</h1>
        {invalid ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{t("linkInvalid")}</p>
            <Link href="/login" className="text-sm text-primary underline">
              {t("backToLogin")}
            </Link>
          </div>
        ) : (
          <MagicComplete email={email} token={token} />
        )}
      </div>
    </main>
  );
}

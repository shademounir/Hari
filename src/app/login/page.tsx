import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { DEMO_USERS, DEMO_PASSWORD } from "@/lib/demo-users";
import { loginAs } from "./actions";
import { CredentialsForm } from "./credentials-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowRight } from "lucide-react";
import { HariLogo } from "@/components/brand/logo";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const t = await getTranslations("login");
  const tRoles = await getTranslations("roles");
  const tDemo = await getTranslations("login.demo");

  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Brand / pitch side — always-dark brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-panel text-brand-panel-foreground p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-gradient opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-gradient opacity-20 blur-3xl" />

        <HariLogo variant="onDark" className="relative" />

        <div className="relative space-y-4 max-w-md">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            {t("pitchTitle")}
          </p>
          <p className="text-base leading-relaxed text-brand-panel-muted">
            {t("pitchDescription")}
          </p>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand-panel-muted">
            {t("tagline")}
          </p>
        </div>
        <p className="relative text-xs text-brand-panel-muted">
          {t("demoBuild")}
        </p>
      </section>

      {/* Login side */}
      <section className="relative flex items-center justify-center p-6 sm:p-12">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md space-y-6">
          <HariLogo className="lg:hidden" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t("signIn")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("chooseRole")}
            </p>
          </div>

          <div className="grid gap-3">
            {DEMO_USERS.map((u) => (
              <form key={u.email} action={loginAs.bind(null, u.email)}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{u.name}</span>
                        <Badge variant="secondary">{tRoles(u.role)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tDemo(u.role)}</p>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      aria-label={t("signInAs", { name: u.name, role: tRoles(u.role) })}
                    >
                      {t("enter")} <ArrowRight className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              </form>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t("orManually")}</span>
            <Separator className="flex-1" />
          </div>

          <CredentialsForm />

          <p className="text-center text-xs text-muted-foreground">
            {t.rich("passwordNote", {
              code: (chunks) => (
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">{chunks}</code>
              ),
              password: DEMO_PASSWORD,
            })}
          </p>
        </div>
      </section>
    </main>
  );
}

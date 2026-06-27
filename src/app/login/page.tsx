import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { DEMO_USERS, isDemoLoginEnabled } from "@/lib/demo-users";
import { loginAs } from "./actions";
import { CredentialsForm } from "./credentials-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Bot, ArrowRight } from "lucide-react";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const t = await getTranslations("login");
  const tRoles = await getTranslations("roles");
  const tDemo = await getTranslations("login.demo");
  const demoMode = isDemoLoginEnabled();

  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Brand / pitch side */}
      <section className="hidden lg:flex flex-col justify-between bg-neutral-950 text-neutral-100 p-12">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="size-6" />
          HARI
        </div>
        <div className="space-y-4 max-w-md">
          <p className="text-3xl font-semibold leading-tight">
            {t("pitchTitle")}
          </p>
          <p className="text-neutral-400">
            {t("pitchDescription")}
          </p>
        </div>
        <p className="text-xs text-neutral-400">
          {t("demoBuild")}
        </p>
      </section>

      {/* Login side */}
      <section className="relative flex items-center justify-center p-6 sm:p-12">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t("signIn")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("chooseRole")}
            </p>
          </div>

          {demoMode ? (
            <div className="grid gap-3">
              <Badge variant="secondary" className="w-fit">{t("demoModeBadge")}</Badge>
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
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                {t("demoModeDisabled")}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t("orManually")}</span>
            <Separator className="flex-1" />
          </div>

          <CredentialsForm />

          {demoMode && (
            <p className="text-center text-xs text-muted-foreground">
              {t("demoPasswordHint")}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

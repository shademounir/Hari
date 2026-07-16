"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarField } from "@/components/profile/avatar-field";
import { updateOwnProfileAction } from "@/app/(dashboard)/profile/actions";

export function ProfileForm({
  initialName,
  initialAvatarUrl,
  email,
}: {
  initialName: string;
  initialAvatarUrl: string | null;
  email: string;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);

  const dirty = name !== initialName || avatarUrl !== initialAvatarUrl;

  function onSave() {
    if (pending) return;
    start(async () => {
      // No id: identity comes from the session. A "self" action never takes one.
      const res = await updateOwnProfileAction({ name, avatarUrl });
      if (res.ok) {
        toast.success(t("saved"));
        router.refresh();
      } else {
        toast.error(t(`error.${res.error}`));
      }
    });
  }

  return (
    <div className="space-y-5">
      <AvatarField name={name} value={avatarUrl} onChange={setAvatarUrl} disabled={pending} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("name")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            disabled={pending}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("email")}</span>
          {/* Read-only: it's the sign-in identity and the key every auth token is
              issued against. Changing it is an HR action, not a self-service one. */}
          <Input value={email} disabled aria-describedby="profile-email-hint" />
          <span id="profile-email-hint" className="block text-xs text-muted-foreground">
            {t("emailHint")}
          </span>
        </label>
      </div>

      <Button onClick={onSave} disabled={pending || !name || !dirty}>
        {t("save")}
      </Button>
    </div>
  );
}

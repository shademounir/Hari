"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Lock } from "lucide-react";
import {
  PERMISSIONS,
  permissionDomain,
  type Permission,
} from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createRoleAction, updateRoleAction, type SaveRoleResult } from "@/app/(dashboard)/settings/roles/actions";
import { normalizeSlugClient } from "./slug";

export type RoleEditorRole = {
  slug: string;
  label: string;
  description: string | null;
  builtIn: boolean;
  usesDefaults: boolean;
  permissions: Permission[];
};

// Permissions the caller can't hand out are rendered disabled: the server refuses
// them anyway (lib/roles `cannotGrant`), and a checkbox that silently fails on
// save is worse than one that says up front it isn't yours to give.
type Props = {
  /** Undefined → create mode. */
  role?: RoleEditorRole;
  /** The editing caller's own permissions, for the no-escalation rule. */
  grantable: Permission[];
  defaultsFor: Permission[] | null;
};

// `admin:settings` on SUPER_ADMIN is the only door back into this page, so it is
// pinned. The server enforces this too (guardrail #1) — this just stops someone
// discovering it by locking themselves out.
function isLocked(role: RoleEditorRole | undefined, p: Permission): boolean {
  return role?.slug === "SUPER_ADMIN" && p === "admin:settings";
}

export function RoleEditor({ role, grantable, defaultsFor }: Props) {
  const t = useTranslations("settings");
  const tPerm = useTranslations("permissions");
  const router = useRouter();
  const [pending, start] = useTransition();

  const [label, setLabel] = useState(role?.label ?? "");
  const [slug, setSlug] = useState(role?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<Permission>>(new Set(role?.permissions ?? []));

  const creating = !role;
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);

  // `domain:action:scope` — the domain is already in the string, so the grouping
  // needs no separate metadata to drift out of sync.
  const groups = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of PERMISSIONS) m.set(permissionDomain(p), [...(m.get(permissionDomain(p)) ?? []), p]);
    return [...m];
  }, []);

  const copyEditable = !role?.builtIn;
  const dirty =
    (copyEditable &&
      (label !== (role?.label ?? "") || description !== (role?.description ?? ""))) ||
    selected.size !== (role?.permissions.length ?? 0) ||
    (role?.permissions ?? []).some((p) => !selected.has(p));

  function toggle(p: Permission, on: boolean) {
    if (isLocked(role, p) || !grantableSet.has(p)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });
  }

  function handle(res: SaveRoleResult, successMsg: string, then?: () => void) {
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
      then?.();
    } else {
      toast.error(t(`error.${res.error}`));
    }
  }

  function onSave() {
    if (pending) return;
    const payload = {
      slug: creating ? normalizeSlugClient(slugTouched ? slug : label) : role!.slug,
      label,
      description: description || undefined,
      permissions: [...selected],
    };
    start(async () => {
      const res = creating ? await createRoleAction(payload) : await updateRoleAction(payload);
      handle(res, creating ? t("roleCreated") : t("saved"), () => {
        if (res.ok) router.push(`/settings/roles/${res.slug}`);
      });
    });
  }

  function onReset() {
    if (pending || !role) return;
    start(async () => {
      const res = await updateRoleAction({
        slug: role.slug,
        label: role.label,
        description: role.description ?? undefined,
        permissions: [],
        resetToDefaults: true,
      });
      handle(res, t("saved"), () => setSelected(new Set(defaultsFor ?? [])));
    });
  }

  const previewSlug = creating ? normalizeSlugClient(slugTouched ? slug : label) : role!.slug;

  return (
    <div className="space-y-6">
      {/* Identity */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("roleName")}</span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("roleNamePlaceholder")}
            maxLength={60}
            required
            // A built-in's name is translated from the roles.* catalog, so a value
            // typed here would never be displayed. The server ignores it too.
            disabled={role?.builtIn || pending}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("roleKey")}</span>
          <Input
            value={previewSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            // A built-in's slug is what the resolver keys its code defaults off,
            // and every historical AiEvent/AuditLog row names it.
            disabled={!creating || pending}
            className="font-mono"
            aria-describedby="role-key-hint"
          />
          <span id="role-key-hint" className="block text-xs text-muted-foreground">
            {t("roleKeyHint")}
          </span>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("roleDescription")}</span>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("roleDescriptionPlaceholder")}
          maxLength={200}
          rows={2}
          disabled={role?.builtIn || pending}
        />
        {role?.builtIn && (
          <span className="block text-xs text-muted-foreground">{t("builtInCopyHint")}</span>
        )}
      </label>

      {/* Permissions, grouped by domain */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{t("permissionsColumn")}</h2>
            <Badge variant="secondary">{t("permissionCount", { count: selected.size })}</Badge>
            {role && !role.builtIn ? null : role?.usesDefaults ? (
              <Badge variant="outline">{t("usesDefaults")}</Badge>
            ) : role ? (
              <Badge variant="outline">{t("customized")}</Badge>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              // Union, not replace: keep anything already ticked (incl. a
              // permission the caller can't grant but the role already holds) and
              // add every grantable one — "select all" must never silently revoke.
              onClick={() =>
                setSelected(
                  (prev) => new Set([...prev, ...PERMISSIONS.filter((p) => grantableSet.has(p))]),
                )
              }
            >
              {t("selectAll")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                setSelected(new Set(PERMISSIONS.filter((p) => isLocked(role, p) && selected.has(p))))
              }
            >
              {t("clearAll")}
            </Button>
          </div>
        </div>

        {groups.map(([domain, permissions]) => (
          <fieldset key={domain} className="rounded-lg border p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {domain}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {permissions.map((p) => {
                const locked = isLocked(role, p);
                const ungrantable = !grantableSet.has(p);
                const disabled = pending || locked || ungrantable;
                return (
                  <div key={p} className="space-y-1">
                    <label className="flex items-start gap-2.5 text-sm">
                      <Checkbox
                        checked={selected.has(p)}
                        onCheckedChange={(v) => toggle(p, v === true)}
                        disabled={disabled}
                        aria-describedby={`${p}-note`}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className={disabled && !locked ? "text-muted-foreground" : "font-medium"}>
                          {tPerm(p)}
                        </span>
                        <code className="ml-1.5 block text-xs text-muted-foreground">{p}</code>
                      </span>
                      {locked && <Lock aria-hidden className="ml-auto mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                    </label>

                    {/* The least obvious consequence in the matrix: visibleDocTiers()
                        derives KB access from the directory permissions, so ticking
                        this quietly opens handbook articles too. Say it where it
                        happens — this is the only place a human would ever see it. */}
                    {(p === "directory:read:team" || p === "directory:read:all") && selected.has(p) && (
                      <p id={`${p}-note`} className="ml-7 flex gap-1.5 text-xs text-muted-foreground">
                        <Info aria-hidden className="mt-0.5 size-3 shrink-0" />
                        {t("kbTierWarning")}
                      </p>
                    )}
                    {locked && (
                      <p id={`${p}-note`} className="ml-7 text-xs text-muted-foreground">
                        {t("lockedPermission")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={pending || !label || (!creating && !dirty)}>
          {creating ? t("createRole") : t("saveChanges")}
        </Button>
        {role?.builtIn && !role.usesDefaults && (
          <Button type="button" variant="outline" onClick={onReset} disabled={pending}>
            {t("resetToDefaults")}
          </Button>
        )}
        {role?.builtIn && (
          <p className="text-xs text-muted-foreground">{t("builtInRoleHint")}</p>
        )}
      </div>
    </div>
  );
}

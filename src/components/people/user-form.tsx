"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { EmploymentType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  inviteUserAction,
  saveUserAction,
  type UserActionResult,
} from "@/app/(dashboard)/people/actions";

export type RoleOption = { slug: string; label: string; assignable: boolean };
export type ManagerOption = { id: string; name: string; title: string };

export type UserFormValues = {
  id?: string;
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  managerId: string | null;
  salary: number | null;
};

const FIELD = "block space-y-1 text-sm";
const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs disabled:opacity-50";

export function UserForm({
  values,
  roles,
  managers,
  employmentTypes,
  /** False when the caller can't read compensation — the field is hidden, not zeroed. */
  canSetSalary,
  /** True when editing yourself: your own role is not yours to change. */
  isSelf = false,
  /**
   * False when this person outranks the caller — their role holds access the
   * caller lacks. The role select is then locked (the server refuses it too).
   * Always true on the invite form (there is no target yet).
   */
  manageable = true,
}: {
  values: UserFormValues;
  roles: RoleOption[];
  managers: ManagerOption[];
  employmentTypes: EmploymentType[];
  canSetSalary: boolean;
  isSelf?: boolean;
  manageable?: boolean;
}) {
  const t = useTranslations("users");
  // The same labels the directory renders — "full time" was a toLowerCase() of the
  // enum, which is neither the app's copy nor translatable.
  const tType = useTranslations("employmentTypeLabel");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<UserFormValues>(values);

  const creating = !values.id;
  const set = <K extends keyof UserFormValues>(k: K, val: UserFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  function handle(res: UserActionResult, msg: string, then?: (id: string) => void) {
    if (res.ok) {
      toast.success(msg);
      router.refresh();
      then?.(res.id);
    } else {
      toast.error(t(`userError.${res.error}`));
    }
  }

  function onSubmit() {
    if (pending) return;
    const base = {
      name: v.name,
      title: v.title,
      department: v.department,
      location: v.location,
      employmentType: v.employmentType,
      managerId: v.managerId || null,
      salary: canSetSalary ? v.salary : null,
    };

    start(async () => {
      if (creating) {
        const res = await inviteUserAction({ ...base, email: v.email, role: v.role });
        handle(res, t("invited"), (id) => router.push(`/people/${id}`));
        return;
      }
      // Profile and role save together in one atomic action: a refused role change
      // must not leave a half-written profile behind. The server still records the
      // role change as its own audit action.
      const roleChanged = v.role !== values.role;
      const res = await saveUserAction({ userId: values.id!, role: v.role, ...base });
      handle(res, roleChanged ? t("roleChanged") : t("profileSaved"));
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={FIELD}>
          <span className="font-medium">{t("name")}</span>
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} required disabled={pending} />
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("email")}</span>
          <Input
            type="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            required
            // The email IS the sign-in identity and the key every auth token is
            // issued against; changing it here would silently orphan them.
            disabled={!creating || pending}
            aria-describedby="email-hint"
          />
          {!creating && (
            <span id="email-hint" className="block text-xs text-muted-foreground">
              {t("emailHint")}
            </span>
          )}
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("role")}</span>
          <select
            className={SELECT}
            value={v.role}
            onChange={(e) => set("role", e.target.value)}
            // Locked for your own row, and for anyone who outranks you (their role
            // holds access you lack) — the server refuses both anyway.
            disabled={pending || isSelf || !manageable}
          >
            {roles.map((r) => (
              // A role granting more than the caller holds is offered but disabled:
              // the server refuses it, and a silent failure on save is worse.
              <option key={r.slug} value={r.slug} disabled={!r.assignable}>
                {r.label}
              </option>
            ))}
          </select>
          {isSelf ? (
            <span className="block text-xs text-muted-foreground">
              {t("userError.self_forbidden")}
            </span>
          ) : !manageable ? (
            <span className="block text-xs text-muted-foreground">
              {t("userError.target_outranks")}
            </span>
          ) : (
            // A disabled <option> is invisible until the dropdown is opened, and
            // silent even then. Say the rule where the choice is made.
            roles.some((r) => !r.assignable) && (
              <span className="block text-xs text-muted-foreground">{t("roleLimited")}</span>
            )
          )}
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("employmentType")}</span>
          <select
            className={SELECT}
            value={v.employmentType}
            onChange={(e) => set("employmentType", e.target.value as EmploymentType)}
            disabled={pending}
          >
            {employmentTypes.map((e) => (
              <option key={e} value={e}>
                {tType(e)}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("jobTitle")}</span>
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} disabled={pending} />
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("department")}</span>
          <Input
            value={v.department}
            onChange={(e) => set("department", e.target.value)}
            disabled={pending}
          />
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("location")}</span>
          <Input
            value={v.location}
            onChange={(e) => set("location", e.target.value)}
            disabled={pending}
          />
        </label>

        <label className={FIELD}>
          <span className="font-medium">{t("manager")}</span>
          <select
            className={SELECT}
            value={v.managerId ?? ""}
            onChange={(e) => set("managerId", e.target.value || null)}
            disabled={pending}
          >
            <option value="">{t("noManager")}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.title}
              </option>
            ))}
          </select>
        </label>

        {canSetSalary && (
          <label className={FIELD}>
            <span className="font-medium">{t("salary")}</span>
            <Input
              type="number"
              min={0}
              value={v.salary ?? ""}
              onChange={(e) => set("salary", e.target.value === "" ? null : Number(e.target.value))}
              disabled={pending}
            />
          </label>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onSubmit} disabled={pending || !v.name || (creating && !v.email)}>
          {creating ? t("sendInvite") : t("save")}
        </Button>
        {!canSetSalary && <p className="text-xs text-muted-foreground">{t("salaryHidden")}</p>}
      </div>
    </div>
  );
}

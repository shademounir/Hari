"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EmploymentType } from "@prisma/client";
import { actorOf, requireUser } from "@/lib/session";
import {
  changeUserRole,
  inviteUser,
  resendInvite,
  setUserActive,
  updateUser,
  updateUserProfile,
  type UserWriteResult,
} from "@/lib/users";

// Thin wrappers. Every rule — the employee:manage gate, the no-escalation subset
// check, no self-modification, the last-admin guard, the salary gate and the
// manager-cycle check — lives in lib/users.ts and is re-checked there, because a
// hand-crafted POST never touches this file's assumptions.

// Derived from Prisma so the form can never offer a value the column rejects.
const EMPLOYMENT_TYPES = Object.values(EmploymentType) as [EmploymentType, ...EmploymentType[]];

const InviteInput = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  role: z.string().min(1).max(32),
  title: z.string().max(120).default(""),
  department: z.string().max(120).default(""),
  location: z.string().max(120).default(""),
  employmentType: z.enum(EMPLOYMENT_TYPES).default(EmploymentType.FULL_TIME),
  managerId: z.string().nullish(),
  salary: z.number().int().min(0).max(100_000_000).nullish(),
});

const ProfileInput = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(120),
  title: z.string().max(120).default(""),
  department: z.string().max(120).default(""),
  location: z.string().max(120).default(""),
  employmentType: z.enum(EMPLOYMENT_TYPES).default(EmploymentType.FULL_TIME),
  managerId: z.string().nullish(),
  salary: z.number().int().min(0).max(100_000_000).nullish(),
});

// Profile + role together — the edit form saves both in one atomic call, so a
// refused role change can't leave a half-written profile behind.
const SaveUserInput = ProfileInput.extend({ role: z.string().min(1).max(32) });

export type UserActionResult = UserWriteResult;

// The directory, the org chart and the nav all read this data.
function refresh() {
  revalidatePath("/", "layout");
}

export async function inviteUserAction(input: unknown): Promise<UserActionResult> {
  const user = await requireUser();
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const res = await inviteUser(actorOf(user), parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function updateUserProfileAction(input: unknown): Promise<UserActionResult> {
  const user = await requireUser();
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const res = await updateUserProfile(actorOf(user), parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function saveUserAction(input: unknown): Promise<UserActionResult> {
  const user = await requireUser();
  const parsed = SaveUserInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const res = await updateUser(actorOf(user), parsed.data);
  if (res.ok) refresh();
  return res;
}

export async function changeUserRoleAction(
  userId: string,
  role: string,
): Promise<UserActionResult> {
  const user = await requireUser();
  if (!userId || !role) return { ok: false, error: "invalid" };
  const res = await changeUserRole(actorOf(user), userId, role);
  if (res.ok) refresh();
  return res;
}

export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<UserActionResult> {
  const user = await requireUser();
  if (!userId) return { ok: false, error: "invalid" };
  const res = await setUserActive(actorOf(user), userId, active);
  if (res.ok) refresh();
  return res;
}

export async function resendInviteAction(userId: string): Promise<UserActionResult> {
  const user = await requireUser();
  if (!userId) return { ok: false, error: "invalid" };
  return resendInvite(actorOf(user), userId);
}

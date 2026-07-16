"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorOf, requireUser } from "@/lib/session";
import { updateOwnProfile, type ProfileResult } from "@/lib/profile";

const Input = z.object({
  name: z.string().min(1).max(120),
  // Identity is the session's — there is deliberately no userId here. "Self"
  // actions take no id (docs/architecture/authorization-invariants.md).
  avatarUrl: z.string().max(300).nullable(),
});

export type SaveProfileResult = ProfileResult;

export async function updateOwnProfileAction(input: unknown): Promise<SaveProfileResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const res = await updateOwnProfile(actorOf(user), parsed.data);
  // The name and avatar show up in the sidebar, the directory and the chat cards.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

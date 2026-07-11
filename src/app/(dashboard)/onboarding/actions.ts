"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { setMyOnboardingStatus } from "@/lib/onboarding";

// SCRUM-095: toggle one of the caller's OWN onboarding steps. Ownership is
// enforced in the data layer (the update no-ops unless the task belongs to the
// caller), so a forged task id can't touch someone else's checklist.
export async function setOnboardingStatusAction(
  taskId: string,
  done: boolean,
): Promise<void> {
  const user = await requireUser();
  if (!user.employeeId) return;
  await setMyOnboardingStatus(user.employeeId, taskId, done ? "DONE" : "PENDING");
  revalidatePath("/onboarding");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CURRENCIES, TIMEZONES, writeOrgSettings } from "@/lib/settings";

// Update org-wide currency / timezone. Server-side authorization is the gate —
// the form is only rendered for super admins, but we re-check here (the same
// `admin:settings` permission) and validate against the allowed lists so a
// hand-crafted POST can't set an arbitrary value.
export async function updateOrgSettings(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "admin:settings")) return;

  const currency = String(formData.get("currency") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  if (
    !(CURRENCIES as readonly string[]).includes(currency) ||
    !(TIMEZONES as readonly string[]).includes(timezone)
  ) {
    return;
  }

  await writeOrgSettings({ currency, timezone });
  // Everything under the dashboard reads these (cards, AI prompt) — refresh all.
  revalidatePath("/", "layout");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CURRENCIES, TIMEZONES, writeOrgSettings } from "@/lib/settings";
import { setCollectionAssistantAccess, setDocumentAssistantAccess } from "@/lib/kb";

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

// ── Assistant access (super-admin: which KB content the AI may use) ────────────
// lib/kb re-checks `admin:settings` too (defense in depth). The effective filter
// is applied live in lib/rag.ts, so no re-embedding is needed — just revalidate
// the KB surfaces that show the policy.

export async function setCollectionAssistantAction(formData: FormData) {
  const user = await requireUser();
  const collectionId = String(formData.get("collectionId") ?? "");
  if (!collectionId) return;
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setCollectionAssistantAccess({ role: user.role, id: user.id }, collectionId, enabled);
  revalidatePath("/kb", "layout"); // admin badges read this
  revalidatePath("/settings/assistant", "layout");
}

export async function setDocumentAssistantAction(formData: FormData) {
  const user = await requireUser();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;
  const raw = String(formData.get("override") ?? "inherit");
  const override = raw === "inherit" ? null : raw === "on";
  await setDocumentAssistantAccess({ role: user.role, id: user.id }, documentId, override);
  revalidatePath("/kb", "layout");
  revalidatePath("/settings/assistant", "layout");
}

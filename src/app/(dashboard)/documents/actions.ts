"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { getUserLocale } from "@/i18n/locale";
import {
  generateWorkCertificate,
  rejectDocumentRequest,
  type FulfillResult,
} from "@/lib/documents";

// Re-resolve the User id from the DB (email is stable across re-seeds) instead
// of trusting the JWT-cached id, which can dangle after a `db:reset` and would
// otherwise violate a GeneratedDocument FK (both requestedById and
// validatedById target User). Same defense as resolveCaller() in lib/hr.ts.
async function resolveActingUserId(email: string): Promise<string> {
  const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!dbUser) redirect("/login");
  return dbUser.id;
}

export async function requestWorkCertificate() {
  const user = await requireUser();

  if (!can(user.role, "documents:request")) {
    redirect("/");
  }

  const userId = await resolveActingUserId(user.email);

  // Captured now so the certificate (SCRUM-081) renders in the requester's own
  // language, not whichever HR admin later clicks Generate — the app only has
  // a per-browser locale cookie, no per-account preference.
  const locale = await getUserLocale();

  await prisma.generatedDocument.create({
    data: {
      type: "WORK_CERTIFICATE",
      status: "REQUESTED",
      requestedById: userId,
      locale,
    },
  });

  revalidatePath("/documents");
  redirect("/documents?requested=1");
}

/**
 * HR fulfillment: validate a request and produce the real PDF. Gated inside
 * `generateWorkCertificate` (documents:download:any). Returns a typed result so the
 * client can toast; revalidates the queue on success.
 */
export async function generateDocumentAction(id: string): Promise<FulfillResult> {
  const user = await requireUser();
  const userId = await resolveActingUserId(user.email);
  const result = await generateWorkCertificate({ userId, role: user.role }, id);
  if (result.ok) revalidatePath("/documents");
  return result;
}

/** HR rejects a request with a note. Gated inside `rejectDocumentRequest`. */
export async function rejectDocumentAction(id: string, note: string): Promise<FulfillResult> {
  const user = await requireUser();
  const userId = await resolveActingUserId(user.email);
  const result = await rejectDocumentRequest({ userId, role: user.role }, id, note);
  if (result.ok) revalidatePath("/documents");
  return result;
}

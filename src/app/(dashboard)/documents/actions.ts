"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import {
  generateWorkCertificate,
  rejectDocumentRequest,
  type FulfillResult,
} from "@/lib/documents";

export async function requestWorkCertificate() {
  const user = await requireUser();

  if (!can(user.role, "documents:request")) {
    redirect("/");
  }

  // Re-resolve the User id from the DB (email is stable across re-seeds) instead
  // of trusting the JWT-cached id, which can dangle after a `db:reset` and would
  // otherwise violate GeneratedDocument_requestedById_fkey (the FK targets User).
  // Same defense as resolveCaller() in lib/hr.ts.
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  if (!dbUser) redirect("/login");

  await prisma.generatedDocument.create({
    data: {
      type: "WORK_CERTIFICATE",
      status: "REQUESTED",
      requestedById: dbUser.id,
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
  const locale = await getLocale();
  const result = await generateWorkCertificate({ userId: user.id, role: user.role }, id, locale);
  if (result.ok) revalidatePath("/documents");
  return result;
}

/** HR rejects a request with a note. Gated inside `rejectDocumentRequest`. */
export async function rejectDocumentAction(id: string, note: string): Promise<FulfillResult> {
  const user = await requireUser();
  const result = await rejectDocumentRequest({ userId: user.id, role: user.role }, id, note);
  if (result.ok) revalidatePath("/documents");
  return result;
}
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { decideDocumentRequest, resolveCaller, type Caller } from "@/lib/hr";
import { generateAndStoreWorkCertificate } from "@/lib/documents";
import { recordAudit } from "@/lib/audit";

export type DecideResult = { ok: boolean };
export type ValidateResult = { ok: boolean; generated: boolean };

type Validator = { caller: Caller; userId: string };

async function requireValidator(): Promise<Validator> {
  const user = await requireUser();
  if (!can(user.role, "documents:validate")) redirect("/");

  // Re-resolve the User id from the DB (email is stable across re-seeds) instead
  // of trusting the JWT-cached id, which can dangle after a `db:reset` and would
  // otherwise violate GeneratedDocument_validatedById_fkey. Same defense as
  // requestWorkCertificate (documents/actions.ts) and resolveCaller (lib/hr.ts).
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  if (!dbUser) redirect("/login");

  const caller = await resolveCaller(user);
  return { caller, userId: dbUser.id };
}

export async function validateDocumentAction(documentId: string): Promise<ValidateResult> {
  const { caller, userId } = await requireValidator();
  const ok = await decideDocumentRequest(caller, userId, documentId, "VALIDATED");
  if (!ok) return { ok: false, generated: false };

  await recordAudit(
    { userId, role: caller.role },
    { action: "DOCUMENT_VALIDATED", targetType: "GeneratedDocument", targetId: documentId },
  );

  // SCRUM-081: generate the PDF right away so the demo's request → validate →
  // download path works end-to-end without a separate manual generation step.
  // A failure here doesn't undo the validation — the document just stays
  // VALIDATED (visible to HR) until generation is retried.
  const { ok: generated } = await generateAndStoreWorkCertificate(documentId);

  revalidatePath("/documents/requests");
  return { ok: true, generated };
}

export async function rejectDocumentAction(
  documentId: string,
  note: string,
): Promise<DecideResult> {
  const { caller, userId } = await requireValidator();
  // A rejection MUST carry a reason — enforced client-side and re-checked here.
  if (!note?.trim()) return { ok: false };

  const ok = await decideDocumentRequest(caller, userId, documentId, "REJECTED", note);
  if (ok) {
    await recordAudit(
      { userId, role: caller.role },
      { action: "DOCUMENT_REJECTED", targetType: "GeneratedDocument", targetId: documentId },
    );
    revalidatePath("/documents/requests");
  }
  return { ok };
}

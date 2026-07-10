"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import {
  requestDocument,
  validateDocument,
  rejectDocument,
  type RequestDocumentInput,
} from "@/lib/documents";
import type { GeneratedDocumentType } from "@prisma/client";

async function actor() {
  const user = await requireUser();
  return { userId: user.id, role: user.role, employeeId: user.employeeId };
}

export async function requestWorkCertificate() {
  const user = await requireUser();
  if (!can(user.role, "documents:request")) redirect("/");

  await requestDocument(await actor(), { type: "WORK_CERTIFICATE" });

  revalidatePath("/documents");
  redirect("/documents?requested=1");
}

export async function requestDocumentAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "documents:request") && !can(user.role, "documents:request:team")) {
    redirect("/");
  }

  const type = formData.get("type") as GeneratedDocumentType | null;
  if (!type) redirect("/documents?error=invalid");

  const input: RequestDocumentInput = { type };
  const targetUserId = formData.get("targetUserId");
  if (typeof targetUserId === "string" && targetUserId) input.targetUserId = targetUserId;
  const leaveRequestId = formData.get("leaveRequestId");
  if (typeof leaveRequestId === "string" && leaveRequestId) input.leaveRequestId = leaveRequestId;

  const result = await requestDocument(await actor(), input);

  revalidatePath("/documents");
  redirect(result.ok ? "/documents?requested=1" : `/documents?error=${result.reason}`);
}

export async function validateDocumentAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "documents:validate")) redirect("/");

  await validateDocument(await actor(), id);
  revalidatePath("/documents");
}

export async function rejectDocumentAction(id: string, note: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "documents:validate")) redirect("/");

  await rejectDocument(await actor(), id, note);
  revalidatePath("/documents");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

export async function requestWorkCertificate() {
  const user = await requireUser();

  if (!can(user.role, "documents:request")) {
    redirect("/");
  }

  await prisma.generatedDocument.create({
    data: {
      type: "WORK_CERTIFICATE",
      status: "REQUESTED",
      requestedById: user.id,
    },
  });

  revalidatePath("/documents");
  redirect("/documents?requested=1");
}
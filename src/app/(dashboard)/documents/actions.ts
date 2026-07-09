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
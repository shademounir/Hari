"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { getUserLocale } from "@/i18n/locale";

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

  // Captured now so the eventual certificate (SCRUM-081) renders in the
  // requester's own language, not whichever HR admin later clicks Approve —
  // the app only has a per-browser locale cookie, no per-account preference.
  const locale = await getUserLocale();

  await prisma.generatedDocument.create({
    data: {
      type: "WORK_CERTIFICATE",
      status: "REQUESTED",
      requestedById: dbUser.id,
      locale,
    },
  });

  revalidatePath("/documents");
  redirect("/documents?requested=1");
}
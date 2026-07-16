import "server-only";
import { prisma } from "@/lib/prisma";
import { can, type Actor } from "@/lib/rbac";
import { deleteObject, keyFromAvatarUrl } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────
// Self-service profile (profile:edit:self).
//
// Deliberately narrow: a person owns their DISPLAY — their name and their face.
// Everything else on the page (title, department, manager, salary, start date) is
// an HR-controlled fact and renders read-only; letting people rewrite their own
// title or manager would quietly corrupt the org chart and every analytic built
// on it. Those edits live in lib/users under `employee:manage`.
// ─────────────────────────────────────────────────────────────────────────

export type OwnProfile = {
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  location: string | null;
  managerName: string | null;
  startDate: Date | null;
};

export type ProfileResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "internal" };

export async function getOwnProfile(caller: Actor): Promise<OwnProfile | null> {
  const u = await prisma.user.findUnique({
    where: { id: caller.userId },
    select: {
      name: true,
      email: true,
      employee: {
        select: {
          avatarUrl: true,
          title: true,
          department: true,
          location: true,
          startDate: true,
          manager: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!u) return null;
  return {
    name: u.name,
    email: u.email,
    avatarUrl: u.employee?.avatarUrl ?? null,
    title: u.employee?.title ?? null,
    department: u.employee?.department ?? null,
    location: u.employee?.location ?? null,
    managerName: u.employee?.manager?.user.name ?? null,
    startDate: u.employee?.startDate ?? null,
  };
}

/** Update the caller's OWN name/avatar. The id is the session's, never an input. */
export async function updateOwnProfile(
  caller: Actor,
  input: { name: string; avatarUrl: string | null },
): Promise<ProfileResult> {
  if (!can(caller, "profile:edit:self")) return { ok: false, error: "forbidden" };

  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "invalid" };

  // Only accept a URL our own upload route minted. Otherwise this field would be
  // an open redirect/SSRF-ish sink: any string would end up in an <img src> for
  // every colleague who views the directory.
  const nextUrl = input.avatarUrl?.trim() || null;
  if (nextUrl && !keyFromAvatarUrl(nextUrl)) return { ok: false, error: "invalid" };

  try {
    const current = await prisma.user.findUnique({
      where: { id: caller.userId },
      select: { employee: { select: { id: true, avatarUrl: true } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: caller.userId }, data: { name } });
      if (current?.employee) {
        await tx.employee.update({
          where: { id: current.employee.id },
          data: { avatarUrl: nextUrl },
        });
      }
    });

    // Best-effort sweep of the replaced object, so a person changing their photo
    // ten times doesn't leave ten orphans in the bucket. A failure here is
    // storage litter, never a failed save.
    const oldKey = keyFromAvatarUrl(current?.employee?.avatarUrl);
    if (oldKey && current?.employee?.avatarUrl !== nextUrl) {
      await deleteObject(oldKey).catch(() => {});
    }
  } catch (err) {
    console.error("[profile] update failed:", err);
    return { ok: false, error: "internal" };
  }
  return { ok: true };
}

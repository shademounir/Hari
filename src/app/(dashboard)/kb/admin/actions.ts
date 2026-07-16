"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, type Role } from "@/lib/rbac";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  createDocument,
  updateDocument,
  publishDocument,
  archiveDocument,
  unpublishToDraft,
  deleteDocument,
  isVisibility,
} from "@/lib/kb";
import { recordAudit } from "@/lib/audit";
import { DocVisibility, type AuditAction } from "@prisma/client";

// Every action re-checks kb:manage server-side (defense in depth: the UI is
// already hidden, and lib/kb asserts too) and validates inputs before writing —
// a hand-crafted POST can't bypass the matrix or set an invalid enum value.
async function requireManager() {
  const user = await requireUser();
  if (!can(user, "kb:manage")) redirect("/");
  return user; // id stamps authorship
}

// KB mutations change what the AI RAG serves org-wide, so they belong on the
// sensitive-action audit trail like leave/document decisions. Metadata only —
// the target id/type, never titles or content.
function auditKb(
  caller: { id: string; role: Role },
  action: AuditAction,
  targetType: string,
  targetId?: string | null,
) {
  return recordAudit({ userId: caller.id, role: caller.role }, { action, targetType, targetId });
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function visibilityOf(fd: FormData): DocVisibility {
  const v = str(fd, "visibility");
  return isVisibility(v) ? v : "ALL_EMPLOYEES";
}

// Comma-separated tags → trimmed, de-duplicated, non-empty list.
function tagsOf(fd: FormData): string[] {
  return [...new Set(str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean))];
}

// Assistant-access override from the form: `inherit`/`on`/`off` → null/true/false.
// Absent (the field isn't rendered for non-eligible roles) → undefined = leave it
// unchanged. lib/kb re-checks `admin:settings` before honoring any value.
function assistantOverrideOf(fd: FormData): boolean | null | undefined {
  if (!fd.has("assistantOverride")) return undefined;
  const v = str(fd, "assistantOverride");
  return v === "on" ? true : v === "off" ? false : null;
}

function refresh() {
  revalidatePath("/kb", "layout"); // reader + admin both read this data
}

// ── Collections ─────────────────────────────────────────────────────────────

export async function createCollectionAction(fd: FormData) {
  const caller = await requireManager();
  const name = str(fd, "name");
  if (!name) return;
  await createCollection(caller, {
    name,
    slug: str(fd, "slug"),
    description: str(fd, "description") || null,
    image: str(fd, "image") || null,
    order: Number(str(fd, "order")) || 0,
  });
  await auditKb(caller, "KB_COLLECTION_CREATED", "KbCollection");
  refresh();
  redirect("/kb/admin?saved=1");
}

export async function updateCollectionAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!id || !name) return;
  await updateCollection(caller, id, {
    name,
    slug: str(fd, "slug"),
    description: str(fd, "description") || null,
    image: str(fd, "image") || null,
    order: Number(str(fd, "order")) || 0,
  });
  await auditKb(caller, "KB_COLLECTION_UPDATED", "KbCollection", id);
  refresh();
  redirect("/kb/admin?saved=1");
}

export async function deleteCollectionAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  if (id) {
    await deleteCollection(caller, id);
    await auditKb(caller, "KB_COLLECTION_DELETED", "KbCollection", id);
  }
  refresh(); // invoked in-place from the admin list (row-actions menu) — no redirect
}

// ── Documents ───────────────────────────────────────────────────────────────

export async function createDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const title = str(fd, "title");
  const collectionId = str(fd, "collectionId");
  if (!title || !collectionId) return;
  await createDocument(caller, {
    title,
    slug: str(fd, "slug"),
    content: String(fd.get("content") ?? ""),
    collectionId,
    visibility: visibilityOf(fd),
    tags: tagsOf(fd),
    assistantOverride: assistantOverrideOf(fd),
  });
  await auditKb(caller, "KB_DOCUMENT_CREATED", "KbDocument");
  refresh();
  redirect("/kb/admin?saved=1");
}

export async function updateDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  const title = str(fd, "title");
  const collectionId = str(fd, "collectionId");
  if (!id || !title || !collectionId) return;
  await updateDocument(caller, id, {
    title,
    slug: str(fd, "slug"),
    content: String(fd.get("content") ?? ""),
    collectionId,
    visibility: visibilityOf(fd),
    tags: tagsOf(fd),
    assistantOverride: assistantOverrideOf(fd),
  });
  await auditKb(caller, "KB_DOCUMENT_UPDATED", "KbDocument", id);
  refresh();
  redirect("/kb/admin?saved=1");
}

export async function publishDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  if (id) {
    await publishDocument(caller, id);
    await auditKb(caller, "KB_DOCUMENT_PUBLISHED", "KbDocument", id);
  }
  refresh();
}

export async function unpublishDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  if (id) {
    await unpublishToDraft(caller, id);
    await auditKb(caller, "KB_DOCUMENT_UNPUBLISHED", "KbDocument", id);
  }
  refresh();
}

export async function archiveDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  if (id) {
    await archiveDocument(caller, id);
    await auditKb(caller, "KB_DOCUMENT_ARCHIVED", "KbDocument", id);
  }
  refresh();
}

export async function deleteDocumentAction(fd: FormData) {
  const caller = await requireManager();
  const id = str(fd, "id");
  if (id) {
    await deleteDocument(caller, id);
    await auditKb(caller, "KB_DOCUMENT_DELETED", "KbDocument", id);
  }
  refresh(); // invoked in-place from the admin list (row-actions menu) — no redirect
}

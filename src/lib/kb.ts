// Role-aware KB data layer — the single layer behind reader pages, admin pages,
// and (via lib/rag.ts) the AI tool, so the chatbot can never surface what the
// reader wouldn't show that role. Reader fns: PUBLISHED + caller's visibleDocTiers
// (else null → notFound). Admin fns: require kb:manage, see every status.
import { DocStatus, DocVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, visibleDocTiers, type Role } from "@/lib/rbac";
import { slugify } from "@/lib/kb/markdown";
import { ingestDocument, removeDocumentChunks } from "@/lib/kb/ingest";
import { searchHandbook } from "@/lib/rag";
import { deleteObject, keyFromCoverUrl } from "@/lib/storage";

// `id` is the signed-in user's id — used to stamp authorship on admin mutations.
// Reader functions only need `role`.
export type KbCaller = { role: Role; id?: string };

const VISIBILITIES = Object.values(DocVisibility);
const STATUSES = Object.values(DocStatus);

export function isVisibility(v: string): v is DocVisibility {
  return (VISIBILITIES as string[]).includes(v);
}

export function isStatus(v: string): v is DocStatus {
  return (STATUSES as string[]).includes(v);
}

// ── Reader (PUBLISHED + caller's visible tiers) ─────────────────────────────

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  visibility: DocVisibility;
  updatedAt: Date;
};

export type CollectionWithArticles = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  articles: ArticleSummary[];
};

// Accept only safe cover sources — a same-origin object-storage path
// (/api/kb/images/…), an external https URL, or a legacy inline data:image URL.
// Anything else (javascript:, oversized blobs, junk) → null, so a hand-crafted
// POST can't smuggle an unsafe value into the rendered cover.
const MAX_IMAGE_LEN = 1_500_000; // ~1 MB once base64-encoded (legacy data: URLs)
export function sanitizeImage(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.length > MAX_IMAGE_LEN) return null;
  if (/^\/api\/kb\/images\/[\w./-]+$/i.test(v)) return v;
  if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(v)) return v;
  if (/^https:\/\//i.test(v)) return v;
  return null;
}

/** Collections (with their visible, published articles) the caller may read. */
export async function listCollectionsWithArticles(
  caller: KbCaller,
): Promise<CollectionWithArticles[]> {
  const tiers = visibleDocTiers(caller.role);
  const collections = await prisma.kbCollection.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      documents: {
        where: { status: "PUBLISHED", visibility: { in: tiers } },
        orderBy: { title: "asc" },
        select: { id: true, slug: true, title: true, visibility: true, updatedAt: true },
      },
    },
  });
  // Drop collections with nothing the caller can see, so the reader stays clean.
  return collections
    .filter((c) => c.documents.length > 0)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      image: c.image,
      articles: c.documents,
    }));
}

export type ArticleDetail = {
  id: string;
  slug: string;
  title: string;
  content: string;
  visibility: DocVisibility;
  updatedAt: Date;
  publishedAt: Date | null;
  collection: { slug: string; name: string };
  authorName: string | null; // who last updated it (falls back to creator)
  tags: string[];
};

/**
 * A single published article the caller may read, or null (not found / not
 * published / above the caller's tier — all indistinguishable on purpose, so a
 * guessed URL can't probe for restricted content).
 */
export async function getArticle(
  caller: KbCaller,
  collectionSlug: string,
  articleSlug: string,
): Promise<ArticleDetail | null> {
  const tiers = visibleDocTiers(caller.role);
  const doc = await prisma.hrDocument.findFirst({
    where: {
      slug: articleSlug,
      status: "PUBLISHED",
      visibility: { in: tiers },
      collection: { slug: collectionSlug },
    },
    include: {
      collection: { select: { slug: true, name: true } },
      updatedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!doc) return null;
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    content: doc.content,
    visibility: doc.visibility,
    updatedAt: doc.updatedAt,
    publishedAt: doc.publishedAt,
    collection: doc.collection,
    authorName: doc.updatedBy?.name ?? doc.createdBy?.name ?? null,
    tags: doc.tags,
  };
}

/** Increment an article's view counter (best-effort; called on reader load). */
export async function incrementViewCount(documentId: string): Promise<void> {
  try {
    await prisma.hrDocument.update({
      where: { id: documentId },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    // non-critical — never break a page render over a view count
  }
}

/**
 * A collection and its visible, published articles for the `/kb/[collection]`
 * landing page. Returns null if the collection is missing OR has nothing the
 * caller may see (so a restricted collection can't be probed by URL).
 */
export async function getCollection(
  caller: KbCaller,
  slug: string,
): Promise<CollectionWithArticles | null> {
  const tiers = visibleDocTiers(caller.role);
  const c = await prisma.kbCollection.findUnique({
    where: { slug },
    include: {
      documents: {
        where: { status: "PUBLISHED", visibility: { in: tiers } },
        orderBy: { title: "asc" },
        select: { id: true, slug: true, title: true, visibility: true, updatedAt: true },
      },
    },
  });
  if (!c || c.documents.length === 0) return null;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    image: c.image,
    articles: c.documents,
  };
}

export type KbSearchResult = {
  id: string;
  articleTitle: string;
  collectionSlug: string;
  articleSlug: string;
  section: string;
  anchor: string;
  url: string;
  similarity: number | null; // null for a lexical-only hit with no embedding
};

/**
 * Semantic KB search for the reader (search box + ⌘K palette). Reuses the same
 * tier+status-filtered pgvector path as the chatbot (lib/rag.ts), so results are
 * scoped exactly like the reader/chat — a user only ever finds what they may read.
 * Returns section-level hits that deep-link to the exact anchor.
 */
export async function searchKb(
  caller: KbCaller,
  query: string,
  limit = 8,
): Promise<KbSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const hits = await searchHandbook(q, limit, caller);
    return hits.map((h) => ({
      id: h.id,
      articleTitle: h.articleTitle,
      collectionSlug: h.collectionSlug,
      articleSlug: h.articleSlug,
      section: h.section,
      anchor: h.anchor,
      url: `/kb/${h.collectionSlug}/${h.articleSlug}${h.anchor ? `#${h.anchor}` : ""}`,
      similarity: h.similarity,
    }));
  } catch {
    return []; // no embedding key / transient failure → empty, not an error
  }
}

/** Other visible, published articles in the same collection (for "Related"). */
export async function getRelatedArticles(
  caller: KbCaller,
  collectionSlug: string,
  excludeId: string,
  limit = 5,
): Promise<ArticleSummary[]> {
  const tiers = visibleDocTiers(caller.role);
  return prisma.hrDocument.findMany({
    where: {
      status: "PUBLISHED",
      visibility: { in: tiers },
      collection: { slug: collectionSlug },
      id: { not: excludeId },
    },
    orderBy: { title: "asc" },
    take: limit,
    select: { id: true, slug: true, title: true, visibility: true, updatedAt: true },
  });
}

/**
 * Record a "was this helpful?" vote (one per user per doc; re-voting updates it).
 * Only accepts votes on a PUBLISHED article the caller may actually see, so a vote
 * can't be forged for a hidden/draft doc. Returns false if not allowed.
 */
export async function submitArticleFeedback(
  caller: KbCaller,
  documentId: string,
  helpful: boolean,
): Promise<boolean> {
  if (!caller.id) return false;
  const tiers = visibleDocTiers(caller.role);
  const doc = await prisma.hrDocument.findFirst({
    where: { id: documentId, status: "PUBLISHED", visibility: { in: tiers } },
    select: { id: true },
  });
  if (!doc) return false;
  await prisma.kbFeedback.upsert({
    where: { documentId_voterId: { documentId, voterId: caller.id } },
    create: { documentId, voterId: caller.id, helpful },
    update: { helpful },
  });
  return true;
}

/** The caller's existing vote for an article (to pre-select the buttons), or null. */
export async function getUserFeedback(
  caller: KbCaller,
  documentId: string,
): Promise<boolean | null> {
  if (!caller.id) return null;
  const f = await prisma.kbFeedback.findUnique({
    where: { documentId_voterId: { documentId, voterId: caller.id } },
    select: { helpful: true },
  });
  return f?.helpful ?? null;
}

// ── Admin (require kb:manage) ───────────────────────────────────────────────

/** Throws if the caller may not manage the KB. Every admin fn calls this first. */
function assertManage(caller: KbCaller): void {
  if (!can(caller.role, "kb:manage")) {
    throw new Error("Forbidden: kb:manage required");
  }
}

export type DocStatusCounts = { DRAFT: number; PUBLISHED: number; ARCHIVED: number; all: number };

/**
 * Document counts by lifecycle status, company-wide — feeds the HR dashboard's
 * corpus card (SCRUM-072). Gated on `dashboard:read:company` (not `kb:manage`):
 * this is a read-only aggregate for the dashboard, not a KB-admin action.
 * Zeroed, never thrown, unless the caller may read the dashboard — mirrors
 * `getAlertStatusCounts`'s gate-and-zero shape.
 */
export async function getDocumentStatusCounts(caller: { role: Role }): Promise<DocStatusCounts> {
  const counts: DocStatusCounts = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0, all: 0 };
  if (!can(caller.role, "dashboard:read:company")) return counts;
  const grouped = await prisma.hrDocument.groupBy({ by: ["status"], _count: { _all: true } });
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.all += g._count._all;
  }
  return counts;
}

/**
 * Free slug derived from `base`, de-duped with a numeric suffix (`overview-2`, …);
 * "untitled" if `base` slugifies empty. Pass `excludeId` when editing. Avoids the
 * uncaught P2002 a raw slug would risk; a rare concurrent-create race can still
 * collide (surfaces as a caller error).
 */
async function uniqueSlug(
  model: "hrDocument" | "kbCollection",
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base) || "untitled";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    const existing =
      model === "hrDocument"
        ? await prisma.hrDocument.findUnique({ where: { slug }, select: { id: true } })
        : await prisma.kbCollection.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === excludeId) return slug;
  }
}

export type AdminDocument = {
  id: string;
  slug: string;
  title: string;
  status: DocStatus;
  visibility: DocVisibility;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
  viewCount: number;
  assistantOverride: boolean | null; // AI override: null = inherit collection
  collection: { id: string; name: string; slug: string };
};

export type AdminCollection = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  order: number;
  documentCount: number;
  assistantEnabled: boolean; // may the AI assistant use this collection?
};

/** All collections (with doc counts) for the admin list. */
export async function listCollectionsForAdmin(caller: KbCaller): Promise<AdminCollection[]> {
  assertManage(caller);
  const rows = await prisma.kbCollection.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    image: c.image,
    order: c.order,
    documentCount: c._count.documents,
    assistantEnabled: c.assistantEnabled,
  }));
}

export type AdminDocFilters = {
  q?: string;
  status?: DocStatus;
  collectionId?: string;
  sort?: "recent" | "title";
};

/** Every document, any status (drafts included), for the admin list — filterable/sortable. */
export async function listDocumentsForAdmin(
  caller: KbCaller,
  filters: AdminDocFilters = {},
): Promise<AdminDocument[]> {
  assertManage(caller);
  const rows = await prisma.hrDocument.findMany({
    where: {
      ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.collectionId ? { collectionId: filters.collectionId } : {}),
    },
    orderBy: filters.sort === "title" ? { title: "asc" } : { updatedAt: "desc" },
    include: {
      collection: { select: { id: true, name: true, slug: true } },
      updatedBy: { select: { name: true } },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    slug: d.slug,
    title: d.title,
    status: d.status,
    visibility: d.visibility,
    version: d.version,
    updatedAt: d.updatedAt,
    updatedByName: d.updatedBy?.name ?? null,
    viewCount: d.viewCount,
    assistantOverride: d.assistantEnabled,
    collection: d.collection,
  }));
}

/** A document by id at any status — used to edit/preview a draft. */
export async function getDocumentForAdmin(caller: KbCaller, id: string) {
  assertManage(caller);
  return prisma.hrDocument.findUnique({
    where: { id },
    include: { collection: { select: { id: true, name: true, slug: true } } },
  });
}

export async function getCollectionForAdmin(caller: KbCaller, id: string) {
  assertManage(caller);
  return prisma.kbCollection.findUnique({ where: { id } });
}

// ── Collection mutations ────────────────────────────────────────────────────

export async function createCollection(
  caller: KbCaller,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    image?: string | null;
    order?: number;
  },
) {
  assertManage(caller);
  return prisma.kbCollection.create({
    data: {
      slug: await uniqueSlug("kbCollection", input.slug || input.name),
      name: input.name,
      description: input.description || null,
      image: sanitizeImage(input.image),
      order: input.order ?? 0,
    },
  });
}

export async function updateCollection(
  caller: KbCaller,
  id: string,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    image?: string | null;
    order?: number;
  },
) {
  assertManage(caller);
  const existing = await prisma.kbCollection.findUnique({
    where: { id },
    select: { image: true },
  });
  const nextImage = sanitizeImage(input.image);
  const updated = await prisma.kbCollection.update({
    where: { id },
    data: {
      slug: await uniqueSlug("kbCollection", input.slug || input.name, id),
      name: input.name,
      description: input.description || null,
      image: nextImage,
      order: input.order ?? 0,
    },
  });
  // Best-effort: drop the previous stored cover if it changed or was cleared, so
  // object storage doesn't accumulate orphans. Never fails the update.
  const oldKey = keyFromCoverUrl(existing?.image);
  if (oldKey && existing?.image !== nextImage) {
    await deleteObject(oldKey).catch(() => {});
  }
  return updated;
}

/** Cascades to its documents and their chunks (FK onDelete: Cascade). */
export async function deleteCollection(caller: KbCaller, id: string) {
  assertManage(caller);
  const existing = await prisma.kbCollection.findUnique({
    where: { id },
    select: { image: true },
  });
  const deleted = await prisma.kbCollection.delete({ where: { id } });
  const key = keyFromCoverUrl(existing?.image);
  if (key) await deleteObject(key).catch(() => {});
  return deleted;
}

// ── Document mutations ──────────────────────────────────────────────────────

/** Create a DRAFT document. Drafts are never ingested → invisible to the chatbot. */
export async function createDocument(
  caller: KbCaller,
  input: {
    slug: string;
    title: string;
    content: string;
    collectionId: string;
    visibility: DocVisibility;
    tags?: string[];
    // Assistant-access override (null = inherit collection). Only applied for
    // callers who hold `admin:settings`; ignored otherwise — so the field on the
    // authoring form is a Super-Admin control even though kb:manage owns the form.
    assistantOverride?: boolean | null;
  },
) {
  assertManage(caller);
  const canSetAssistant = can(caller.role, "admin:settings");
  return prisma.hrDocument.create({
    data: {
      slug: await uniqueSlug("hrDocument", input.slug || input.title),
      title: input.title,
      content: input.content,
      collectionId: input.collectionId,
      visibility: input.visibility,
      tags: input.tags ?? [],
      status: "DRAFT",
      assistantEnabled: canSetAssistant ? (input.assistantOverride ?? null) : null,
      createdById: caller.id ?? null,
      updatedById: caller.id ?? null,
    },
  });
}

/**
 * Save edits. If the doc is PUBLISHED, the change is live, so bump the version
 * and re-index; a DRAFT just stores the new content (no embedding cost, stays
 * invisible to the chatbot until published).
 */
export async function updateDocument(
  caller: KbCaller,
  id: string,
  input: {
    slug: string;
    title: string;
    content: string;
    collectionId: string;
    visibility: DocVisibility;
    tags?: string[];
    // `undefined` = leave the override untouched (the field wasn't editable for
    // this caller). A value is only honored for `admin:settings` holders.
    assistantOverride?: boolean | null;
  },
) {
  assertManage(caller);
  const existing = await prisma.hrDocument.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) throw new Error("Document not found");

  const isPublished = existing.status === "PUBLISHED";
  const setAssistant =
    input.assistantOverride !== undefined && can(caller.role, "admin:settings");
  const updated = await prisma.hrDocument.update({
    where: { id },
    data: {
      slug: await uniqueSlug("hrDocument", input.slug || input.title, id),
      title: input.title,
      content: input.content,
      collectionId: input.collectionId,
      visibility: input.visibility,
      tags: input.tags ?? [],
      updatedById: caller.id ?? null,
      ...(setAssistant ? { assistantEnabled: input.assistantOverride } : {}),
      ...(isPublished ? { version: { increment: 1 } } : {}),
    },
  });
  if (isPublished) await ingestDocument(id); // re-embed live content
  return updated;
}

/**
 * DRAFT/ARCHIVED → PUBLISHED. Bump version, then index BEFORE flipping status so a
 * failed embed never leaves a PUBLISHED doc with no citable chunks. (Keyless:
 * ingest is a no-op; the doc publishes without RAG until a key is set.)
 */
export async function publishDocument(caller: KbCaller, id: string) {
  assertManage(caller);
  const existing = await prisma.hrDocument.update({
    where: { id },
    data: { version: { increment: 1 } },
    select: { publishedAt: true },
  });
  await ingestDocument(id);
  await prisma.hrDocument.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      // Keep the first-published date if re-publishing (don't overwrite it).
      publishedAt: existing.publishedAt ?? new Date(),
      updatedById: caller.id ?? null,
    },
  });
}

/** PUBLISHED → ARCHIVED: drop its chunks so it leaves the RAG immediately. */
export async function archiveDocument(caller: KbCaller, id: string) {
  assertManage(caller);
  await prisma.hrDocument.update({ where: { id }, data: { status: "ARCHIVED" } });
  await removeDocumentChunks(id);
}

/** PUBLISHED → DRAFT: drop its chunks so it leaves the RAG immediately. */
export async function unpublishToDraft(caller: KbCaller, id: string) {
  assertManage(caller);
  await prisma.hrDocument.update({ where: { id }, data: { status: "DRAFT" } });
  await removeDocumentChunks(id);
}

export async function deleteDocument(caller: KbCaller, id: string) {
  assertManage(caller);
  return prisma.hrDocument.delete({ where: { id } });
}

// ── Assistant access (super-admin policy: which KB content the AI may use) ─────
// Separate from kb:manage on purpose: deciding what the assistant can draw on is
// an org-policy call held by `admin:settings` (Super Admin), and it lives in its
// own surface (Settings) so editing a collection/document can never change it by
// accident. The control is additive-only — enforced in lib/rag.ts, it can hide
// content from the assistant but never widen access past status + visibility tier.

/** Throws unless the caller may configure assistant access. */
function assertConfigureAssistant(caller: KbCaller): void {
  if (!can(caller.role, "admin:settings")) {
    throw new Error("Forbidden: admin:settings required");
  }
}

export type AssistantAccessDocument = {
  id: string;
  title: string;
  status: DocStatus;
  override: boolean | null; // null = inherit collection
  effective: boolean; // resolved availability to the assistant
};

export type AssistantCollectionRow = {
  id: string;
  name: string;
  assistantEnabled: boolean;
  documentCount: number;
  overrideCount: number; // docs with an explicit override (≠ inherit)
};

/**
 * Collections with their assistant-access flag + counts, for the Settings list.
 * Deliberately does NOT load documents (there can be thousands) — the per-doc
 * overrides are managed on the per-collection page via `listAssistantDocuments`.
 */
export async function listAssistantCollections(
  caller: KbCaller,
  q?: string,
): Promise<AssistantCollectionRow[]> {
  assertConfigureAssistant(caller);
  const rows = await prisma.kbCollection.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      assistantEnabled: true,
      _count: { select: { documents: true } },
      // Only the overridden docs (bounded by the # of overrides, not total docs).
      documents: { where: { assistantEnabled: { not: null } }, select: { id: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    assistantEnabled: c.assistantEnabled,
    documentCount: c._count.documents,
    overrideCount: c.documents.length,
  }));
}

/** A single collection's assistant flag + name, for the per-collection page header. */
export async function getAssistantCollection(caller: KbCaller, collectionId: string) {
  assertConfigureAssistant(caller);
  return prisma.kbCollection.findUnique({
    where: { id: collectionId },
    select: { id: true, name: true, assistantEnabled: true },
  });
}

export type AssistantDocumentPage = {
  documents: AssistantAccessDocument[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * One page of a collection's documents with their resolved assistant access.
 * Server-side search + pagination so the page stays fast at thousands of docs.
 */
export async function listAssistantDocuments(
  caller: KbCaller,
  collectionId: string,
  opts: { q?: string; page?: number; pageSize?: number } = {},
): Promise<AssistantDocumentPage> {
  assertConfigureAssistant(caller);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const col = await prisma.kbCollection.findUniqueOrThrow({
    where: { id: collectionId },
    select: { assistantEnabled: true },
  });
  const where = {
    collectionId,
    ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.hrDocument.findMany({
      where,
      orderBy: { title: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, status: true, assistantEnabled: true },
    }),
    prisma.hrDocument.count({ where }),
  ]);
  return {
    documents: rows.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      override: d.assistantEnabled,
      effective: d.assistantEnabled ?? col.assistantEnabled,
    })),
    total,
    page,
    pageSize,
  };
}

/** Toggle whether the assistant may use a whole collection (super-admin). */
export async function setCollectionAssistantAccess(
  caller: KbCaller,
  collectionId: string,
  enabled: boolean,
) {
  assertConfigureAssistant(caller);
  return prisma.kbCollection.update({
    where: { id: collectionId },
    data: { assistantEnabled: enabled },
  });
}

/**
 * Set a document's assistant override (super-admin): `true` force-on, `false`
 * force-off, `null` inherit the collection. No re-ingest — lib/rag.ts resolves
 * the effective value live at query time.
 */
export async function setDocumentAssistantAccess(
  caller: KbCaller,
  documentId: string,
  override: boolean | null,
) {
  assertConfigureAssistant(caller);
  return prisma.hrDocument.update({
    where: { id: documentId },
    data: { assistantEnabled: override },
  });
}

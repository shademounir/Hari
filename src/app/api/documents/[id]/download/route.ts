// SCRUM-082: secure PDF download endpoint. RBAC is enforced by
// authorizeDocumentDownload (lib/documents.ts) before any storage access.
// MinIO is never exposed directly — the PDF is proxied server-side,
// consistent with the KB cover-image proxy (api/kb/images/[...key]).
import { getApiCaller } from "@/lib/session";
import { authorizeDocumentDownload } from "@/lib/documents";
import { getObject } from "@/lib/storage";

// Prisma + AWS SDK + auth() — Node runtime, always dynamic (never cached).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getApiCaller();
  if (!caller) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const result = await authorizeDocumentDownload(
    { userId: caller.id, role: caller.role, permissions: caller.permissions },
    id,
  );

  if (!result.ok) {
    // Don't echo the internal reason vocabulary; a 403/404 status is enough and a
    // 404 (rather than 403) for out-of-scope ids keeps the endpoint IDOR-quiet.
    const status = result.reason === "forbidden" ? 403 : 404;
    return new Response(status === 403 ? "Forbidden" : "Not found", { status });
  }

  const object = await getObject(result.pdfUrl);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="document-${id}.pdf"`,
    "X-Content-Type-Options": "nosniff",
  });
  if (object.contentLength) {
    headers.set("Content-Length", String(object.contentLength));
  }

  return new Response(object.stream, { headers });
}

// SCRUM-082: secure PDF download endpoint. RBAC is enforced by
// authorizeDocumentDownload (lib/documents.ts) before any storage access.
// MinIO is never exposed directly — the PDF is proxied server-side,
// consistent with the KB cover-image proxy (api/kb/images/[...key]).
import { auth } from "@/lib/auth";
import { authorizeDocumentDownload } from "@/lib/documents";
import { getObject } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const result = await authorizeDocumentDownload(
    { userId: session.user.id, role: session.user.role, employeeId: session.user.employeeId },
    id,
  );

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : 404;
    return new Response(result.reason, { status });
  }

  const object = await getObject(result.pdfUrl);
  if (!object) return new Response("not_found", { status: 404 });

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

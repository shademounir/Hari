// SCRUM-082: secure PDF download endpoint. RBAC is enforced by
// authorizeDocumentDownload (lib/documents.ts) before any storage access.
// MinIO is never exposed directly — the PDF is proxied server-side,
// consistent with the KB cover-image proxy (api/kb/images/[...key]).
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeDocumentDownload } from "@/lib/documents";
import { getObject } from "@/lib/storage";

// Prisma + AWS SDK + auth() — Node runtime, always dynamic (never cached).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  // Re-resolve the acting user id from the DB by email (stable across re-seeds)
  // instead of trusting the JWT-cached id, which can dangle after a `db:reset`
  // and would then misclassify the requester as a non-owner — a 403 on their
  // own certificate, and the DOWNLOADED stamp never fires. Same defense as the
  // document server actions (resolveActingUserId) and lib/hr.ts resolveCaller().
  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!dbUser) return new Response("Unauthorized", { status: 401 });

  const result = await authorizeDocumentDownload(
    { userId: dbUser.id, role: session.user.role },
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

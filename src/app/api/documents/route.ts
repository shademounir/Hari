// SCRUM-094: request + list generated HR documents. RBAC is enforced entirely
// by the lib/documents.ts functions (never re-implemented here).
import { auth } from "@/lib/auth";
import { requestDocument, listDocumentsFor, type RequestDocumentInput } from "@/lib/documents";
import type { GeneratedDocumentType } from "@prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as GeneratedDocumentType | null;
  const status = searchParams.get("status");

  const items = await listDocumentsFor(
    { userId: session.user.id, role: session.user.role, employeeId: session.user.employeeId },
    { type: type ?? undefined, status: status ?? undefined },
  );
  return Response.json({ items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as RequestDocumentInput;
  const result = await requestDocument(
    { userId: session.user.id, role: session.user.role, employeeId: session.user.employeeId },
    body,
  );

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 422;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ id: result.id }, { status: 201 });
}

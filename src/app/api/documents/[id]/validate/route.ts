// SCRUM-094: HR/manager validation of a pending document request — moves
// REQUESTED → VALIDATED and triggers PDF generation. RBAC + per-type scoping
// live entirely in lib/documents.ts (validateDocument → rules.ts).
import { auth } from "@/lib/auth";
import { validateDocument } from "@/lib/documents";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const result = await validateDocument(
    { userId: session.user.id, role: session.user.role, employeeId: session.user.employeeId },
    id,
  );

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 422;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ id: result.id });
}

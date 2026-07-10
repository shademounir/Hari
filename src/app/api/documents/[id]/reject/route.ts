// SCRUM-094: HR/manager rejection of a pending document request — the note
// is mandatory (enforced in lib/documents.ts's rejectDocument).
import { auth } from "@/lib/auth";
import { rejectDocument } from "@/lib/documents";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const { note } = (await req.json()) as { note?: string };

  const result = await rejectDocument(
    { userId: session.user.id, role: session.user.role, employeeId: session.user.employeeId },
    id,
    note ?? "",
  );

  if (!result.ok) {
    const status = result.reason === "forbidden" ? 403 : result.reason === "not_found" ? 404 : 422;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ id: result.id });
}

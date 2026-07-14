import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { searchKb } from "@/lib/kb";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

// Authenticated KB search. Results are tier+status scoped to the caller (searchKb
// → lib/rag), so a user can never find a document they couldn't read.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Explicit permission gate (parity with the reader/chat and the upload route).
  // Every role holds handbook:read today; this keeps search from silently staying
  // open if a future role is added without it.
  if (!can(session.user.role, "handbook:read")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await rateLimit("kb-search", session.user.id, 60, 60_000)).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchKb({ role: session.user.role }, q);
  return Response.json({ results });
}

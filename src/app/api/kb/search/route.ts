import { auth } from "@/lib/auth";
import { searchKb } from "@/lib/kb";

export const maxDuration = 30;

// Authenticated KB search. Results are tier+status scoped to the caller (searchKb
// → lib/rag), so a user can never find a document they couldn't read.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchKb({ role: session.user.role }, q);
  return Response.json({ results });
}

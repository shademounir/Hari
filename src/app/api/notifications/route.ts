import { getApiCaller } from "@/lib/session";
import { buildNotifications } from "@/lib/notifications";

// Role-scoped bell contents, fetched on demand by the client (mount + on open),
// so the shared dashboard layout no longer blocks first paint with these queries
// and the badge can't go stale on soft navigation.
export const runtime = "nodejs";

export async function GET() {
  const caller = await getApiCaller();
  if (!caller) return new Response("Unauthorized", { status: 401 });

  const items = await buildNotifications(caller);
  return Response.json({ items });
}

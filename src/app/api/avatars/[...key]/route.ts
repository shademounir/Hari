import { getApiCaller } from "@/lib/session";
import { getObject } from "@/lib/storage";

// Same-origin proxy that streams an avatar from the PRIVATE object-storage bucket.
//
// Unlike api/kb/images (public: covers are decorative and unguessable), this one
// REQUIRES a session. A face is personal data under the project's CNDP posture,
// so an unguessable key is not the bar we want it held to. The cost is that
// next/image's optimizer can't fetch it (it runs server-side without the user's
// cookies), so avatars render through a plain <img> — a 512px WebP barely needs
// the optimizer, and the browser sends its cookies here.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!(await getApiCaller())) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  let objectKey: string;
  try {
    objectKey = key.map((seg) => decodeURIComponent(seg)).join("/");
  } catch {
    // Malformed percent-encoding (e.g. a lone "%") → the same quiet 404 as a miss,
    // never an unhandled 500.
    return new Response("Not found", { status: 404 });
  }
  // Only ever serve avatars/* — and never let ".." climb out of that prefix.
  if (!objectKey.startsWith("avatars/") || objectKey.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await getObject(objectKey);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": obj.contentType,
    // Private: the key is stable but the object is personal data, so it must not
    // land in a shared cache.
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (obj.contentLength != null) headers.set("Content-Length", String(obj.contentLength));
  return new Response(obj.stream, { headers });
}

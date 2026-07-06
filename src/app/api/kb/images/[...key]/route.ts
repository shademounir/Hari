import { getObject } from "@/lib/storage";

// Same-origin proxy that streams a KB cover from the PRIVATE object-storage
// bucket. Public (no auth): covers are decorative, keys are unguessable UUIDs,
// and the next/image optimizer fetches this server-side (without user cookies).
// Stored objects are always rasterized WebP (see api/kb/upload), so there is no
// active content; `nosniff` + `sandbox` are belt-and-suspenders.
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objectKey = key.map((seg) => decodeURIComponent(seg)).join("/");
  // Only ever serve covers/* — and never let ".." climb out of that prefix.
  if (!objectKey.startsWith("covers/") || objectKey.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await getObject(objectKey);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": obj.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (obj.contentLength != null) headers.set("Content-Length", String(obj.contentLength));
  return new Response(obj.stream, { headers });
}

import sharp from "sharp";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { putCover, coverUrl } from "@/lib/storage";

// Upload a KB collection cover to object storage. Manager-only (kb:manage), same
// permission the data layer (lib/kb.ts assertManage) and the server actions enforce.
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2_000_000; // 2 MB — image-field pre-compresses rasters to WebP

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!can(session.user.role, "kb:manage")) {
    return new Response("Forbidden", { status: 403 });
  }

  // Reject oversized bodies before buffering them into memory.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) return new Response("File too large", { status: 413 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("No file", { status: 400 });
  if (!file.type.startsWith("image/")) return new Response("Unsupported type", { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return new Response("File too large", { status: 413 });

  // Always rasterize to WebP server-side: this strips any active content from an
  // SVG (no stored XSS when the cover is served back same-origin) and guarantees
  // the stored object is an optimizer-servable raster for next/image.
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return new Response("Invalid image", { status: 415 });
  }

  const key = await putCover(webp, "image/webp");
  return Response.json({ url: coverUrl(key) });
}

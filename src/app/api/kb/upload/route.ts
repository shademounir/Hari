import sharp from "sharp";
import { getApiCaller } from "@/lib/session";
import { can } from "@/lib/rbac";
import { putCover, coverUrl } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

// Upload a KB collection cover to object storage. Manager-only (kb:manage), same
// permission the data layer (lib/kb.ts assertManage) and the server actions enforce.
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2_000_000; // 2 MB — image-field pre-compresses rasters to WebP
// Explicit raster allow-list. `image/*` would also admit SVG (which can carry
// script) and exotic formats; we only ever want a raster the optimizer serves back.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const caller = await getApiCaller();
  if (!caller) return new Response("Unauthorized", { status: 401 });
  if (!can(caller, "kb:manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await rateLimit("kb-upload", caller.id, 20, 60_000)).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  // Reject oversized bodies before buffering them into memory.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) return new Response("File too large", { status: 413 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("No file", { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return new Response("Unsupported type", { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return new Response("File too large", { status: 413 });

  // Re-encode to WebP server-side so the stored object is always a clean,
  // optimizer-servable raster. `limitInputPixels` caps the decoded size so a tiny
  // "decompression bomb" can't balloon into hundreds of MB in the worker, and
  // `failOn: "error"` rejects malformed input instead of guessing at it.
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 24_000_000, // ~24 MP ceiling
      failOn: "error",
    })
      .rotate()
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return new Response("Invalid image", { status: 415 });
  }

  const key = await putCover(webp, "image/webp");
  return Response.json({ url: coverUrl(key) });
}

import sharp from "sharp";
import { getApiCaller } from "@/lib/session";
import { can } from "@/lib/rbac";
import { putAvatar, avatarUrl } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

// Upload a profile picture to object storage. Mirrors api/kb/upload — the same
// re-encode-and-never-trust-the-bytes posture — with an avatar's own limits.
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 1_000_000; // 1 MB — the field pre-compresses to WebP
const AVATAR_SIZE = 512; // avatars render at ≤64px; 512 covers retina and crops square
// Explicit raster allow-list. `image/*` would also admit SVG (which can carry
// script) and exotic formats; we only ever want a raster we re-encode ourselves.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const caller = await getApiCaller();
  if (!caller) return new Response("Unauthorized", { status: 401 });
  // Anyone may maintain their own face; `employee:manage` covers doing it for
  // someone else. The upload only mints an object — the URL is only attached to a
  // profile by an action that re-checks who may write that profile.
  if (!can(caller, "profile:edit:self") && !can(caller, "employee:manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await rateLimit("avatar-upload", caller.id, 10, 60_000)).ok) {
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

  // Re-encode server-side so the stored object is always a clean raster, whatever
  // was uploaded. `limitInputPixels` caps the decoded size so a tiny
  // "decompression bomb" can't balloon in the worker, and `failOn: "error"`
  // rejects malformed input instead of guessing at it.
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 24_000_000, // ~24 MP ceiling
      failOn: "error",
    })
      .rotate() // honor EXIF orientation before cropping, or portraits crop sideways
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return new Response("Invalid image", { status: 415 });
  }

  const key = await putAvatar(webp, "image/webp");
  return Response.json({ url: avatarUrl(key) });
}

import { randomUUID } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// S3-compatible object storage (MinIO in dev) for Knowledge Base cover images.
// The bucket is PRIVATE — images are only ever served through the same-origin
// proxy route (src/app/api/kb/images/[...key]/route.ts), never exposed directly.
// Server-only: reads S3_* secrets and uses the AWS SDK, so it must not be
// imported into any client component.

const BUCKET = process.env.S3_BUCKET ?? "kb-images";
const COVER_URL_PREFIX = "/api/kb/images/";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  forcePathStyle: true, // required for MinIO / non-AWS S3
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fail fast in production if storage isn't configured — never silently fall back
// to the dev minioadmin/localhost defaults against a real deployment.
function assertConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing = ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    throw new Error(`Object storage is not configured — set ${missing.join(", ")}.`);
  }
}

function isNotFound(err: unknown): boolean {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  const name = (err as { name?: string })?.name;
  return status === 404 || name === "NotFound" || name === "NoSuchBucket" || name === "NoSuchKey";
}

let bucketReady = false;

/**
 * Create the bucket if it doesn't exist. Retries a few times so we tolerate
 * MinIO still starting up (compose brings it up alongside the app). Idempotent.
 * A genuine error (e.g. 403 AccessDenied — wrong creds) is rethrown immediately
 * rather than masked as "missing bucket" + a slow retry loop.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  assertConfigured();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
      bucketReady = true;
      return;
    } catch (headErr) {
      // Only "missing bucket" warrants a create; a 403/misconfig must surface.
      if (!isNotFound(headErr) && (headErr as { name?: string })?.name !== "Forbidden") {
        const status = (headErr as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
        // Connection refused (MinIO booting) has no HTTP status → keep retrying;
        // any real HTTP error (403 etc.) is fatal.
        if (status) throw headErr;
      }
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
        bucketReady = true;
        return;
      } catch (createErr) {
        const name = (createErr as { name?: string })?.name;
        if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") {
          bucketReady = true;
          return;
        }
        lastErr = createErr;
        await sleep(1000);
      }
    }
  }
  throw new Error(`MinIO bucket "${BUCKET}" not ready`, { cause: lastErr });
}

function extFor(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("webp")) return "webp";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  return "bin";
}

/** Upload a cover image; returns the object key (e.g. `covers/<uuid>.webp`). */
export async function putCover(
  bytes: Uint8Array | Buffer,
  contentType: string,
): Promise<string> {
  await ensureBucket();
  const key = `covers/${randomUUID()}.${extFor(contentType)}`;
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType }),
  );
  return key;
}

/** Stream an object (body + content type), or null if it doesn't exist. */
export async function getObject(
  key: string,
): Promise<{ stream: ReadableStream; contentType: string; contentLength?: number } | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      stream: res.Body!.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    if (!isNotFound(err)) throw err; // best-effort: a missing object is fine
  }
}

/** Turn a stored object key into the same-origin proxy path used in <Image>. */
export function coverUrl(key: string): string {
  return `${COVER_URL_PREFIX}${key}`;
}

/** Parse a stored cover URL back to its object key (null if not a proxy path). */
export function keyFromCoverUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(COVER_URL_PREFIX)) return null;
  return url.slice(COVER_URL_PREFIX.length);
}

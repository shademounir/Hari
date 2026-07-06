/* eslint-disable no-console */
// One-off migration: move any legacy inline `data:` collection covers into object
// storage (MinIO) and rewrite KbCollection.image to the same-origin proxy path,
// so every cover renders through next/image. Idempotent — rows already on
// /api/kb/images/ or https:// are skipped. Run: `npm run db:migrate-covers`.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { putCover, coverUrl } from "../src/lib/storage";

const prisma = new PrismaClient();

function parseDataUrl(v: string): { contentType: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(v);
  if (!m) return null;
  const contentType = m[1];
  const bytes = m[2]
    ? Buffer.from(m[3], "base64")
    : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { contentType, bytes };
}

async function main() {
  const rows = await prisma.kbCollection.findMany({
    where: { image: { startsWith: "data:" } },
    select: { id: true, slug: true, image: true },
  });
  console.log(`Found ${rows.length} collection(s) with inline data: covers.`);

  for (const row of rows) {
    const parsed = parseDataUrl(row.image ?? "");
    if (!parsed) {
      console.warn(`  ⚠ ${row.slug}: unparseable data URL — skipped`);
      continue;
    }
    let { contentType, bytes } = parsed;
    // SVGs (incl. the old seed gradients) are rasterized to WebP so next/image
    // can optimize them without dangerouslyAllowSVG.
    if (contentType.includes("svg")) {
      bytes = await sharp(bytes).resize(1200, 300, { fit: "inside" }).webp({ quality: 82 }).toBuffer();
      contentType = "image/webp";
    }
    const key = await putCover(bytes, contentType);
    await prisma.kbCollection.update({ where: { id: row.id }, data: { image: coverUrl(key) } });
    console.log(`  ✓ ${row.slug} -> ${coverUrl(key)}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

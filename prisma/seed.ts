/* eslint-disable no-console */
import "dotenv/config"; // self-contained when run directly via tsx
import {
  PrismaClient,
  type Role,
  type DocVisibility,
  EmploymentStatus,
  EmploymentType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { embedTexts, toVectorLiteral } from "../src/lib/ai/embeddings";
import { chunkHtml } from "../src/lib/kb/html";
import { DEMO_USERS } from "../src/lib/demo-users";
import { putCover, coverUrl } from "../src/lib/storage";
import { KB_COLLECTIONS } from "./handbook";
import { seedTeamActivity } from "./team-activity";

// Seed corpus is authored in markdown for readability; store it as HTML (the
// editor + reader work in HTML). Seed-only, so it lives here rather than in the
// runtime lib/kb/html module.
const mdToHtml = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify);
const markdownToHtml = (markdown: string): string => String(mdToHtml.processSync(markdown));

// Rasterize a seed SVG gradient to WebP and store it in object storage, so seed
// covers are served + optimized through next/image exactly like admin uploads.
async function uploadCover(svg: string): Promise<string> {
  const webp = await sharp(Buffer.from(svg)).resize(1200, 300).webp({ quality: 82 }).toBuffer();
  const key = await putCover(webp, "image/webp");
  return coverUrl(key);
}

const prisma = new PrismaClient();
const PASSWORD = "password123";

type Seed = {
  email: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  location: string;
  salary: number;
  manager?: string; // email of manager
  login: boolean; // demo login account?
  status?: "ACTIVE" | "ON_LEAVE" | "TERMINATED";
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACTOR";
};

// Seed-only attributes for the demo login accounts. Their identity fields
// (name, role, title, department, location) come from the shared DEMO_USERS so
// the seed and the login page can never disagree about who these accounts are.
const DEMO_EXTRAS: Record<string, { salary: number; manager?: string }> = {
  "admin@hari.ma": { salary: 350000 },
  "rh@hari.ma": { salary: 250000 },
  "manager@hari.ma": { salary: 300000 },
  "collaborateur@hari.ma": { salary: 180000, manager: "manager@hari.ma" },
};

const PEOPLE: Seed[] = [
  // Comptes de démonstration principaux (identité partagée avec la page de connexion)
  ...DEMO_USERS.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    department: u.department,
    location: u.location,
    ...DEMO_EXTRAS[u.email],
    login: true,
  })),

  // Comptes secondaires pour peupler l'annuaire et les équipes
  {
    email: "a.mansouri@hari.ma",
    name: "Amina Mansouri",
    role: "EMPLOYEE",
    title: "Développeuse Frontend",
    department: "IT",
    location: "Rabat",
    salary: 150000,
    manager: "manager@hari.ma",
    login: false,
    status: "ON_LEAVE",
    employmentType: "PART_TIME",
  },
  {
    email: "a.elmarrouni@hari.ma",
    name: "Ahmed El marrouni",
    role: "EMPLOYEE",
    title: "Développeuse Full stack",
    department: "IT",
    location: "Tetouan",
    salary: 150000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "CONTRACTOR",
  },
  {
    email: "m.bennani@hari.ma",
    name: "Mehdi Bennani",
    role: "EMPLOYEE",
    title: "Développeur Backend",
    department: "IT",
    location: "Tétouan",
    salary: 160000,
    manager: "manager@hari.ma",
    login: false,
    status: "TERMINATED",
    employmentType: "FULL_TIME",
  },
  {
    email: "s.amrani@hari.ma",
    name: "Sara Amrani",
    role: "EMPLOYEE",
    title: "UX/UI Designer",
    department: "Design",
    location: "Casablanca",
    salary: 145000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "PART_TIME",
  },
  {
    email: "o.alaoui@hari.ma",
    name: "Omar Alaoui",
    role: "EMPLOYEE",
    title: "DevOps Engineer",
    department: "Infrastructure",
    location: "Rabat",
    salary: 210000,
    manager: "manager@hari.ma",
    login: false,
    status: "ON_LEAVE",
    employmentType: "FULL_TIME",
  }, {
    email: "f.idrissi@hari.ma",
    name: "Fatima Zahra Idrissi",
    role: "EMPLOYEE",
    title: "QA Engineer",
    department: "Quality Assurance",
    location: "Marrakech",
    salary: 155000,
    manager: "manager@hari.ma",
    login: false,
    status: "TERMINATED",
    employmentType: "CONTRACTOR",
  },
];

async function seedPeople() {
  if ((await prisma.user.count()) > 0) {
    console.log("• People already seeded — skipping.");
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const byEmail: Record<string, string> = {}; // email -> employeeId

  // Pass 1: create users + employees (no manager link yet).
  for (const p of PEOPLE) {
    const user = await prisma.user.create({
      data: {
        email: p.email,
        name: p.name,
        role: p.role,
        passwordHash: p.login ? passwordHash : await bcrypt.hash("disabled", 10),
        employee: {
          create: {
            title: p.title,
            department: p.department,
            location: p.location,
            salary: p.salary,
            startDate: new Date("2023-01-15"),
            status: (p.status as EmploymentStatus) ?? EmploymentStatus.ACTIVE,
            employmentType: (p.employmentType as EmploymentType) ?? EmploymentType.FULL_TIME,

            leaveBalances: {
              create: [
                { type: "VACATION", totalDays: 20, usedDays: 4 },
                { type: "SICK", totalDays: 10, usedDays: 1 },
                { type: "PERSONAL", totalDays: 5, usedDays: 0 },
              ],
            },
          },
        },
      },
      include: { employee: true },
    });
    // byEmail[p.email] = user.employee!.id;
    if (!user.employee) throw new Error(`Employee not created for ${p.email}`);
    byEmail[p.email] = user.employee.id;

  }


  // Pass 2: wire up manager relationships.
  for (const p of PEOPLE) {
    if (p.manager) {
      await prisma.employee.update({
        where: { id: byEmail[p.email] },
        data: { managerId: byEmail[p.manager] },
      });
    }
  }

  // Leave requests + AI activity are seeded separately (prisma/team-activity.ts)
  // so the manager dashboard has ~6 months of realistic, deterministic history.
  console.log(`• Seeded ${PEOPLE.length} people (4 demo logins).`);
}

// Data only — the schema (halfvec column, HNSW index, pgvector extension) is
// owned by the Prisma migration in prisma/migrations, not by the seed.
//
// Seeds collections + documents, then chunks & embeds the PUBLISHED ones (DRAFT
// docs are intentionally left unindexed — invisible to the chatbot). Only
// PUBLISHED chunks carry the denormalized visibility tier, so RAG access control
// works the same as the live publish pipeline (src/lib/kb/ingest.ts).
async function seedKnowledgeBase() {
  if ((await prisma.hrDocument.count()) > 0) {
    console.log("• Knowledge base already seeded — skipping.");
    return;
  }

  // Attribute seeded docs to the HR admin (falls back to any user) so the reader
  // and admin show an author.
  const author =
    (await prisma.user.findUnique({ where: { email: "rh@hari.ma" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }));
  const authorId = author?.id ?? null;

  // Create collections + documents (relational rows; no embeddings yet).
  const publishedDocs: {
    id: string;
    content: string;
    visibility: DocVisibility;
    version: number;
  }[] = [];
  for (const col of KB_COLLECTIONS) {
    const collection = await prisma.kbCollection.create({
      data: {
        slug: col.slug,
        name: col.name,
        description: col.description,
        image: col.image ? await uploadCover(col.image) : null,
        assistantEnabled: col.assistantEnabled ?? true,
        order: col.order,
      },
    });
    for (const doc of col.documents) {
      const status = doc.status ?? "PUBLISHED";
      // Authored in markdown for readability; stored as HTML (the editor + reader
      // work in HTML).
      const html = markdownToHtml(doc.content);
      const created = await prisma.hrDocument.create({
        data: {
          slug: doc.slug,
          title: doc.title,
          content: html,
          visibility: doc.visibility,
          tags: doc.tags ?? [],
          status,
          collectionId: collection.id,
          createdById: authorId,
          updatedById: authorId,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
        },
      });
      if (status === "PUBLISHED") {
        publishedDocs.push({
          id: created.id,
          content: html,
          visibility: doc.visibility,
          version: created.version,
        });
      }
    }
  }
  console.log(
    `• Seeded ${KB_COLLECTIONS.length} collections, ${publishedDocs.length} published documents.`,
  );

  // Chunk every published document. Chunks are always inserted so the lexical
  // (full-text) half of the hybrid query works even without an API key; the
  // embeddings (semantic half) are added only when a key is present. So a keyless
  // seed (e.g. CI) still produces a searchable KB — semantic ranking turns on once
  // a key is set and you re-seed (db:reset).
  const flat = publishedDocs.flatMap((d) =>
    chunkHtml(d.content).map((c) => ({ doc: d, chunk: c })),
  );
  const hasKey = !!process.env.OPENROUTER_API_KEY;
  if (hasKey) {
    console.log(`• Embedding ${flat.length} chunks…`);
  } else {
    console.warn(
      "⚠ No OPENROUTER_API_KEY — chunks indexed for full-text search only. " +
      "Semantic ranking is disabled until you add the key and re-seed (db:reset).",
    );
  }
  const vectors = hasKey
    ? await embedTexts(flat.map((f) => `${f.chunk.section}\n${f.chunk.content}`))
    : null;

  // Atomic: a mid-loop failure rolls back so a retry re-embeds cleanly instead
  // of leaving a partial corpus that the count() guard above would skip forever.
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < flat.length; i++) {
        const { doc, chunk } = flat[i];
        const row = await tx.handbookChunk.create({
          data: {
            documentId: doc.id,
            section: chunk.section,
            anchor: chunk.anchor,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            version: doc.version,
            visibility: doc.visibility,
          },
        });
        if (vectors) {
          await tx.$executeRawUnsafe(
            `UPDATE "HandbookChunk" SET embedding = $1::halfvec WHERE id = $2`,
            toVectorLiteral(vectors[i]),
            row.id,
          );
        }
      }
    },
    { timeout: 30_000 },
  );
  console.log(hasKey ? "• Knowledge base embedded." : "• Knowledge base indexed (full-text only).");
}

async function main() {
  await seedPeople();
  await seedTeamActivity(prisma);
  await seedKnowledgeBase();
}

main()
  .then(() => console.log("✓ Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

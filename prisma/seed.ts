/* eslint-disable no-console */
import "dotenv/config"; // self-contained when run directly via tsx
import {
  PrismaClient,
  type Prisma,
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
import {
  computeDepartureRisk,
  type DepartureRiskInput,
} from "../src/lib/predictive/departure-risk";
import { seedAnalytics } from "./analytics-seed";

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
  // Generated-workforce extras (SCRUM-098). Optional so the hand-written demo
  // accounts above are unaffected; the predictive pass fills in the rest.
  // `startDate` accepts a Date (generateWorkforce) or an ISO string (hand-written
  // PEOPLE / SCRUM-097 rows); the creation loop coerces via `new Date(...)`.
  startDate?: Date | string; // defaults to 2023-01-15
  leftAt?: Date; // set for TERMINATED so department turnover has real data
  vacationUsed?: number;
  sickUsed?: number;
  // HR-analytics dimensions (HARI-122). Optional so demo accounts can omit them
  // and fall back to sensible defaults.
  birthDate?: string; // ISO date → age pyramid
  gender?: "FEMALE" | "MALE" | "OTHER";
  contractType?: "CDI" | "CDD" | "ALTERNANCE" | "STAGE";
  timeToHireDays?: number;
  terminationDate?: string; // ISO date; required in spirit when status = TERMINATED
  departureReason?: "VOLUNTARY" | "INVOLUNTARY" | "RETIREMENT" | "END_OF_CONTRACT";
};

// Seed-only attributes for the demo login accounts. Their identity fields
// (name, role, title, department, location) come from the shared DEMO_USERS so
// the seed and the login page can never disagree about who these accounts are.
const DEMO_EXTRAS: Record<
  string,
  Pick<Seed, "salary" | "manager" | "birthDate" | "gender" | "contractType" | "timeToHireDays">
> = {
  "admin@hari.ma": { salary: 350000, birthDate: "1978-04-12", gender: "MALE", timeToHireDays: 52 },
  "rh@hari.ma": { salary: 250000, birthDate: "1985-09-30", gender: "FEMALE", timeToHireDays: 40 },
  "manager@hari.ma": { salary: 300000, birthDate: "1982-11-05", gender: "MALE", timeToHireDays: 45 },
  "collaborateur@hari.ma": {
    salary: 180000,
    manager: "manager@hari.ma",
    birthDate: "1994-06-18",
    gender: "FEMALE",
    timeToHireDays: 33,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — dense, deterministic mock workforce so the predictive dashboard
// has real data: a colorful risk map, a rendered projection (needs ≥20 active),
// department turnover (TERMINATED with leftAt) and absences (ON_LEAVE). A tiny
// seeded PRNG keeps re-seeds reproducible (no Math.random).
// ─────────────────────────────────────────────────────────────────────────
const NOW = new Date();
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * (365.25 / 12);

/** A date `n` months before the seed's reference "now". */
function monthsAgo(n: number): Date {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - Math.round(n));
  return d;
}
function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MONTH);
}

/** Deterministic string → 32-bit seed, then a mulberry32 PRNG (stable per key). */
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-job-profile market baseline (mirrors lib/predictive/data-layer; inlined to keep the seed server-only-free). */
function jobProfileBaseline(title: string): number {
  const t = title.toLowerCase();
  const table: [string, number][] = [
    ["engineer", 0.6], ["developer", 0.6], ["data", 0.55], ["designer", 0.5],
    ["sales", 0.45], ["account", 0.45], ["product", 0.45], ["marketing", 0.4],
    ["operations", 0.35], ["logistics", 0.35], ["support", 0.35], ["success", 0.35],
    ["finance", 0.3], ["controller", 0.3], ["recruit", 0.28], ["people", 0.25], ["hr", 0.25],
  ];
  for (const [needle, risk] of table) if (t.includes(needle)) return risk;
  return 0.3;
}

const FIRST_NAMES = [
  "Youssef", "Salma", "Karim", "Nadia", "Hamza", "Imane", "Rachid", "Leila",
  "Anas", "Sofia", "Bilal", "Hind", "Tariq", "Meryem", "Zakaria", "Asmae",
  "Younes", "Rania", "Ayoub", "Khadija", "Marouane", "Ghita", "Ismail", "Loubna",
  "Reda", "Sanae", "Adil", "Wafaa", "Nabil", "Dounia", "Othmane", "Yasmine",
];
const LAST_NAMES = [
  "Benali", "Cherkaoui", "Fassi", "Ouazzani", "Berrada", "Tazi", "Sekkat",
  "Naciri", "Bouzid", "Lahlou", "Kadiri", "Sabri", "Chraibi", "Belmekki",
  "Ziani", "Squalli", "Bennis", "Alami", "Hakimi", "Rami",
];
const LOCATIONS = ["Casablanca", "Rabat", "Marrakech", "Tanger", "Fès", "Tétouan"];

const GEN_DEPARTMENTS: { department: string; lead: string; titles: string[]; base: number }[] = [
  { department: "Engineering", lead: "Engineering Manager", titles: ["Backend Engineer", "Frontend Engineer", "Full-Stack Engineer", "DevOps Engineer", "QA Engineer"], base: 185000 },
  { department: "Product", lead: "Head of Product", titles: ["Product Manager", "Product Analyst", "Product Owner"], base: 195000 },
  { department: "Design", lead: "Design Lead", titles: ["UX Designer", "UI Designer", "Product Designer"], base: 150000 },
  { department: "Sales", lead: "Sales Manager", titles: ["Account Executive", "Sales Development Rep", "Key Account Manager"], base: 160000 },
  { department: "Marketing", lead: "Marketing Manager", titles: ["Content Strategist", "Growth Marketer", "Marketing Specialist"], base: 150000 },
  { department: "Finance", lead: "Finance Manager", titles: ["Financial Analyst", "Accountant", "Controller"], base: 170000 },
  { department: "People", lead: "People Ops Manager", titles: ["HR Specialist", "Recruiter", "People Partner"], base: 150000 },
  { department: "Support", lead: "Support Lead", titles: ["Support Specialist", "Customer Success Manager"], base: 130000 },
  { department: "Operations", lead: "Operations Manager", titles: ["Operations Analyst", "Logistics Coordinator"], base: 140000 },
  { department: "Data", lead: "Data Lead", titles: ["Data Analyst", "Data Engineer", "Data Scientist"], base: 205000 },
];

/**
 * Build ~60 employees: one ACTIVE people-manager per department (so succession
 * planning has incumbents with reports) plus 5 members each. Statuses are spread
 * so ≥50 are ACTIVE and ≥10 are TERMINATED/ON_LEAVE (with dates that feed the
 * turnover + absence signals). Fully deterministic — no Math.random.
 */
function generateWorkforce(): Seed[] {
  const people: Seed[] = [];
  let idx = 0; // global index → unique emails + deterministic variety
  let memberIdx = 0;

  for (let d = 0; d < GEN_DEPARTMENTS.length; d++) {
    const dept = GEN_DEPARTMENTS[d];
    const leadEmail = `lead.${dept.department.toLowerCase()}@hari.ma`;

    const nameOf = (i: number) =>
      `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 7) % LAST_NAMES.length]}`;

    // Department lead (always ACTIVE, manages the members).
    people.push({
      email: leadEmail,
      name: nameOf(idx),
      role: "MANAGER",
      title: dept.lead,
      department: dept.department,
      location: LOCATIONS[idx % LOCATIONS.length],
      salary: dept.base + 60000,
      login: false,
      status: "ACTIVE",
      startDate: monthsAgo(60 + (idx % 24)),
      vacationUsed: 6 + (idx % 8),
      sickUsed: idx % 3,
    });
    idx++;

    for (let m = 0; m < 5; m++) {
      // Spread statuses across members: ~1 in 7 terminated, ~1 in 11 on leave.
      let status: Seed["status"] = "ACTIVE";
      let leftAt: Date | undefined;
      if (memberIdx % 7 === 3) {
        status = "TERMINATED";
        leftAt = monthsAgo(1 + (memberIdx % 10)); // within the last ~11 months
      } else if (memberIdx % 11 === 5) {
        status = "ON_LEAVE";
      }

      const title = dept.titles[m % dept.titles.length];
      const empTypes: Seed["employmentType"][] = ["FULL_TIME", "FULL_TIME", "FULL_TIME", "PART_TIME", "CONTRACTOR"];

      people.push({
        email: `${dept.department.toLowerCase()}.${idx}@hari.ma`,
        name: nameOf(idx),
        role: "EMPLOYEE",
        title,
        department: dept.department,
        location: LOCATIONS[idx % LOCATIONS.length],
        salary: dept.base + (idx % 5) * 8000,
        manager: leadEmail,
        login: false,
        status,
        employmentType: empTypes[idx % empTypes.length],
        startDate: monthsAgo(6 + ((idx * 7) % 108)),
        leftAt,
        vacationUsed: [2, 12, 18, 8, 15][idx % 5], // varied → burnout spread
        sickUsed: idx % 4,
      });
      idx++;
      memberIdx++;
    }
  }
  return people;
}

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

  // Comptes secondaires pour peupler l'annuaire, les équipes et les analytics RH.
  // Attributs (naissance, genre, contrat, départs) répartis pour donner des
  // courbes réalistes : pyramide des âges, turnover sur 24 mois, mixité, contrats.
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
    startDate: "2023-03-01",
    birthDate: "1996-02-14",
    gender: "FEMALE",
    contractType: "CDI",
    timeToHireDays: 30,
  },
  {
    email: "a.elmarrouni@hari.ma",
    name: "Ahmed El marrouni",
    role: "EMPLOYEE",
    title: "Développeur Full stack",
    department: "IT",
    location: "Tetouan",
    salary: 150000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "CONTRACTOR",
    startDate: "2024-09-02",
    birthDate: "1999-08-21",
    gender: "MALE",
    contractType: "CDD",
    timeToHireDays: 25,
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
    startDate: "2022-05-10",
    birthDate: "1990-12-01",
    gender: "MALE",
    contractType: "CDI",
    timeToHireDays: 48,
    terminationDate: "2025-08-31",
    departureReason: "VOLUNTARY",
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
    startDate: "2023-06-15",
    birthDate: "1993-04-09",
    gender: "FEMALE",
    contractType: "CDI",
    timeToHireDays: 38,
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
    startDate: "2021-11-08",
    birthDate: "1987-07-19",
    gender: "MALE",
    contractType: "CDI",
    timeToHireDays: 60,
  },
  {
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
    startDate: "2023-02-01",
    birthDate: "1995-10-25",
    gender: "FEMALE",
    contractType: "CDD",
    timeToHireDays: 22,
    terminationDate: "2025-03-15",
    departureReason: "END_OF_CONTRACT",
  },
  // — Effectif élargi (autres départements, âges, contrats, départs échelonnés) —
  {
    email: "y.bouzid@hari.ma",
    name: "Yassine Bouzid",
    role: "EMPLOYEE",
    title: "Commercial Grands Comptes",
    department: "Sales",
    location: "Casablanca",
    salary: 175000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    startDate: "2020-01-20",
    birthDate: "1975-03-03",
    gender: "MALE",
    contractType: "CDI",
    timeToHireDays: 55,
  },
  {
    email: "l.haddadi@hari.ma",
    name: "Leila Haddadi",
    role: "EMPLOYEE",
    title: "Contrôleuse de Gestion",
    department: "Finance",
    location: "Rabat",
    salary: 195000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    startDate: "2019-09-01",
    birthDate: "1968-01-28",
    gender: "FEMALE",
    contractType: "CDI",
    timeToHireDays: 70,
  },
  {
    email: "h.tahiri@hari.ma",
    name: "Hamza Tahiri",
    role: "EMPLOYEE",
    title: "Chargé Marketing",
    department: "Marketing",
    location: "Tanger",
    salary: 120000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    startDate: "2025-01-06",
    birthDate: "2001-05-16",
    gender: "MALE",
    contractType: "ALTERNANCE",
    timeToHireDays: 18,
  },
  {
    email: "n.ouazzani@hari.ma",
    name: "Nour Ouazzani",
    role: "EMPLOYEE",
    title: "Stagiaire Data",
    department: "IT",
    location: "Tétouan",
    salary: 60000,
    manager: "manager@hari.ma",
    login: false,
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    startDate: "2026-02-02",
    birthDate: "2003-09-11",
    gender: "FEMALE",
    contractType: "STAGE",
    timeToHireDays: 12,
  },
  {
    email: "r.sabri@hari.ma",
    name: "Rachid Sabri",
    role: "EMPLOYEE",
    title: "Administrateur Systèmes",
    department: "Infrastructure",
    location: "Casablanca",
    salary: 165000,
    manager: "manager@hari.ma",
    login: false,
    status: "TERMINATED",
    employmentType: "FULL_TIME",
    startDate: "2018-04-03",
    birthDate: "1961-02-20",
    gender: "MALE",
    contractType: "CDI",
    timeToHireDays: 65,
    terminationDate: "2024-12-31",
    departureReason: "RETIREMENT",
  },
  {
    email: "k.benjelloun@hari.ma",
    name: "Khadija Benjelloun",
    role: "EMPLOYEE",
    title: "Business Analyst",
    department: "Sales",
    location: "Rabat",
    salary: 140000,
    manager: "manager@hari.ma",
    login: false,
    status: "TERMINATED",
    employmentType: "FULL_TIME",
    startDate: "2023-10-16",
    birthDate: "1992-11-30",
    gender: "FEMALE",
    contractType: "CDI",
    timeToHireDays: 42,
    terminationDate: "2026-05-20",
    departureReason: "INVOLUNTARY",
  },

  // SCRUM-098: dense generated workforce (≥50 active, ≥10 non-active).
  ...generateWorkforce(),
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
            leftAt: p.leftAt ?? null,
            startDate: new Date(p.startDate ?? "2023-01-15"),
            status: (p.status as EmploymentStatus) ?? EmploymentStatus.ACTIVE,
            employmentType: (p.employmentType as EmploymentType) ?? EmploymentType.FULL_TIME,
            birthDate: p.birthDate ? new Date(p.birthDate) : null,
            gender: p.gender ?? null,
            contractType: p.contractType ?? "CDI",
            timeToHireDays: p.timeToHireDays ?? null,
            terminationDate: p.terminationDate ? new Date(p.terminationDate) : null,
            departureReason: p.departureReason ?? null,

            leaveBalances: {
              create: [
                { type: "VACATION", totalDays: 20, usedDays: p.vacationUsed ?? 4 },
                { type: "SICK", totalDays: 10, usedDays: p.sickUsed ?? 1 },
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

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-098 — predictive signals + risk snapshots. For every employee we
// generate a persona-driven set of signals (deterministic per email), persist
// the underlying history (reviews, salary changes, surveys), and — for ACTIVE
// employees — write a DepartureRiskSnapshot computed by the REAL scorer, so the
// risk map, factor breakdowns, and projection all agree. Idempotent.
// ─────────────────────────────────────────────────────────────────────────
type Persona = "high" | "medium" | "low";
const PERSONA_RANGES: Record<
  Persona,
  { review: [number, number]; eng: [number, number]; growth: [number, number]; abs: [number, number]; pto: [number, number]; role: [number, number]; rating: [number, number] }
> = {
  high: { review: [18, 30], eng: [1, 4], growth: [-0.03, 0.0], abs: [12, 26], pto: [10, 16], role: [40, 72], rating: [1, 3] },
  medium: { review: [8, 16], eng: [4, 6], growth: [0.0, 0.04], abs: [5, 14], pto: [5, 11], role: [20, 46], rating: [2, 4] },
  low: { review: [1, 7], eng: [7, 9], growth: [0.05, 0.12], abs: [0, 5], pto: [0, 4], role: [3, 24], rating: [3, 5] },
};

async function seedPredictiveData() {
  if ((await prisma.departureRiskSnapshot.count()) > 0) {
    console.log("• Predictive data already seeded — skipping.");
    return;
  }

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      title: true,
      department: true,
      salary: true,
      startDate: true,
      status: true,
      managerId: true,
      leftAt: true,
      user: { select: { email: true } },
    },
  });

  // Ensure every TERMINATED employee has a recent leftAt so department turnover
  // and the domino effect have real inputs (older demo rows may lack it).
  for (const e of employees) {
    if (e.status === "TERMINATED" && !e.leftAt) {
      const d = monthsAgo(1 + (hashSeed(e.id) % 10));
      await prisma.employee.update({ where: { id: e.id }, data: { leftAt: d } });
      e.leftAt = d;
    }
  }

  // Department turnover (trailing 12 months) computed once — no N+1.
  const windowStart = monthsAgo(12);
  const activeByDept = new Map<string, number>();
  const departedByDept = new Map<string, number>();
  for (const e of employees) {
    if (e.status === "ACTIVE") activeByDept.set(e.department, (activeByDept.get(e.department) ?? 0) + 1);
    if (e.leftAt && e.leftAt >= windowStart) departedByDept.set(e.department, (departedByDept.get(e.department) ?? 0) + 1);
  }
  const turnoverByDept = new Map<string, number>();
  for (const dept of new Set([...activeByDept.keys(), ...departedByDept.keys()])) {
    const a = activeByDept.get(dept) ?? 0;
    const d = departedByDept.get(dept) ?? 0;
    turnoverByDept.set(dept, a + d === 0 ? 0 : d / (a + d));
  }

  const byId = new Map(employees.map((e) => [e.id, e]));
  const sixMonthsAgo = monthsAgo(6);
  const managerLeftRecently = (managerId: string | null): boolean => {
    if (!managerId) return false;
    const m = byId.get(managerId);
    return !!(m && m.leftAt && m.leftAt >= sixMonthsAgo);
  };

  const reviews: Prisma.PerformanceReviewCreateManyInput[] = [];
  const salaries: Prisma.SalaryChangeCreateManyInput[] = [];
  const surveys: Prisma.EngagementSurveyCreateManyInput[] = [];
  const snapshots: Prisma.DepartureRiskSnapshotCreateManyInput[] = [];
  const roleAnchors: { id: string; lastReviewDate: Date; lastRoleChangeDate: Date }[] = [];

  for (const e of employees) {
    const rng = mulberry32(hashSeed(e.user.email));
    const roll = rng();
    let persona: Persona = roll < 0.22 ? "high" : roll < 0.5 ? "medium" : "low";
    // Departed employees were mostly high-risk before leaving → gives the accuracy
    // back-test (getModelAccuracy) a realistic, mostly-correct signal to score.
    if (e.status === "TERMINATED") persona = rng() < 0.82 ? "high" : "medium";
    const r = PERSONA_RANGES[persona];
    const pick = (min: number, max: number) => min + rng() * (max - min);

    const tenureMonths = monthsBetween(e.startDate, NOW);
    const reviewMonthsAgo = Math.min(Math.round(pick(...r.review)), Math.max(1, Math.round(tenureMonths)));
    const roleMonths = Math.min(Math.round(pick(...r.role)), Math.max(1, Math.round(tenureMonths)));
    const engagement = rng() < 0.1 ? null : Math.round(pick(...r.eng));
    const salaryGrowth = Number(pick(...r.growth).toFixed(3));
    const absence = Math.round(pick(...r.abs));
    const unusedPto = Math.round(pick(...r.pto));
    const rating = Math.round(pick(...r.rating));

    const reviewDate = monthsAgo(reviewMonthsAgo);
    const roleChangeDate = monthsAgo(roleMonths);

    // History rows (coherent with the signals above). PerformanceReview is the
    // unified model (SCRUM-097 + 098): the review date is `conductedAt`.
    reviews.push({ employeeId: e.id, conductedAt: reviewDate, rating });
    roleAnchors.push({ id: e.id, lastReviewDate: reviewDate, lastRoleChangeDate: roleChangeDate });
    const priorSalary = Math.round(e.salary / (1 + salaryGrowth));
    salaries.push({ employeeId: e.id, effectiveDate: monthsAgo(13), amount: priorSalary, reason: "Annual review" });
    if (salaryGrowth > 0) {
      salaries.push({ employeeId: e.id, effectiveDate: monthsAgo(1), amount: e.salary, reason: "Merit increase" });
    }
    if (engagement !== null) {
      surveys.push({ employeeId: e.id, score: engagement, surveyDate: monthsAgo(1 + (hashSeed(e.id) % 3)), source: "quarterly-pulse" });
    }

    // Snapshot for ACTIVE (risk map / projection) and TERMINATED (accuracy
    // back-test): a departed employee's last pre-departure snapshot is stamped at
    // their leftAt so getModelAccuracy can score the prediction against the outcome.
    if (e.status === "ACTIVE" || e.status === "TERMINATED") {
      const input: DepartureRiskInput = {
        asOf: NOW,
        startDate: e.startDate,
        lastReviewDate: reviewDate,
        absenceDaysLast12m: absence,
        salaryGrowthPct12m: salaryGrowth,
        departmentTurnoverRate: turnoverByDept.get(e.department) ?? 0,
        jobProfileRiskBaseline: jobProfileBaseline(e.title),
        unusedPtoDaysLast12m: unusedPto,
        monthsInCurrentRole: roleMonths,
        managerLeftRecently: managerLeftRecently(e.managerId),
        recentEngagementScore: engagement,
      };
      const result = computeDepartureRisk(input);
      snapshots.push({
        employeeId: e.id,
        score: result.score,
        band: result.band,
        factors: result.factors as unknown as Prisma.InputJsonValue,
        weightVersion: 0,
        computedAt: e.status === "TERMINATED" ? (e.leftAt ?? NOW) : NOW,
      });
    }
  }

  await prisma.performanceReview.createMany({ data: reviews });
  await prisma.salaryChange.createMany({ data: salaries });
  if (surveys.length) await prisma.engagementSurvey.createMany({ data: surveys });
  await prisma.departureRiskSnapshot.createMany({ data: snapshots });
  for (const a of roleAnchors) {
    await prisma.employee.update({
      where: { id: a.id },
      data: { lastReviewDate: a.lastReviewDate, lastRoleChangeDate: a.lastRoleChangeDate },
    });
  }

  const bands = snapshots.reduce(
    (acc, s) => ((acc[s.band] = (acc[s.band] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  console.log(
    `• Seeded predictive data: ${reviews.length} reviews, ${salaries.length} salary changes, ` +
      `${surveys.length} surveys, ${snapshots.length} risk snapshots ` +
      `(LOW ${bands.LOW ?? 0} / MEDIUM ${bands.MEDIUM ?? 0} / HIGH ${bands.HIGH ?? 0}).`,
  );
}

async function main() {
  await seedPeople();
  await seedTeamActivity(prisma);
  await seedPredictiveData();
  await seedAnalytics(prisma);
  await seedKnowledgeBase();
}

main()
  .then(() => console.log("✓ Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

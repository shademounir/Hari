// ─────────────────────────────────────────────────────────────────────────
// Team seed — the HARI project team as base users, with full HR profiles so the
// app looks populated (directory, org chart, leave, analytics, predictions).
//
// IDEMPOTENT: safe to run on every boot. It checks whether the team already
// exists and SKIPS when it does; otherwise it fills in exactly what's missing
// (per-record upserts + existence guards), so a partial DB self-heals.
//
// Run:  npm run db:seed:team        (or: node --import tsx prisma/seed-team.ts)
// Login: any email below + password "password123", or magic link / OTP.
// ─────────────────────────────────────────────────────────────────────────
import { PrismaClient } from "@prisma/client";
import type { Role, Gender, RiskBand, LeaveType, LeaveStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";

// Standalone runs (node --import tsx) don't auto-load .env the way `prisma db
// seed` / Next.js do — so read DATABASE_URL (and friends) from .env if unset,
// BEFORE the Prisma client is constructed.
if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const prisma = new PrismaClient();

export const TEAM_PASSWORD = "password123";

type Person = {
  email: string;
  name: string;
  role: Role;
  title: string;
  department: string;
  location: string;
  salary: number;
  gender: Gender;
  birth: string;
  start: string;
  manager: string | null; // manager email
  risk: number;
  band: RiskBand;
  eng: number; // 0–10 engagement
  rating: number; // 1–5 review rating
};

// Emails are stored lowercased (auth normalizes anyway).
const PEOPLE: Person[] = [
  { email: "mounir.baali50@ynov.com", name: "Mounir Baali", role: "SUPER_ADMIN", title: "Directeur Technique (DSI)", department: "Direction", location: "Casablanca", salary: 380000, gender: "MALE", birth: "1990-04-12", start: "2021-09-01", manager: null, risk: 12, band: "LOW", eng: 9, rating: 5 },
  { email: "kawtar.halib@ynov.com", name: "Kawtar Halib", role: "HR_ADMIN", title: "Responsable Ressources Humaines", department: "Ressources Humaines", location: "Casablanca", salary: 240000, gender: "FEMALE", birth: "1992-07-03", start: "2022-01-10", manager: "mounir.baali50@ynov.com", risk: 18, band: "LOW", eng: 8, rating: 5 },
  { email: "mouad.omlil@ynov.com", name: "Mouad Omlil", role: "MANAGER", title: "Engineering Manager", department: "Engineering", location: "Tétouan", salary: 265000, gender: "MALE", birth: "1998-11-20", start: "2022-03-01", manager: "mounir.baali50@ynov.com", risk: 22, band: "LOW", eng: 8, rating: 5 },
  { email: "yassine.elhaddad@ynov.com", name: "Yassine El Haddad", role: "MANAGER", title: "Product Manager", department: "Product", location: "Rabat", salary: 250000, gender: "MALE", birth: "1996-02-15", start: "2022-06-15", manager: "mounir.baali50@ynov.com", risk: 30, band: "LOW", eng: 7, rating: 4 },
  { email: "chaimaa.mellouk@ynov.com", name: "Chaimaa Mellouk", role: "EMPLOYEE", title: "Data / Analytics Engineer", department: "Data", location: "Casablanca", salary: 175000, gender: "FEMALE", birth: "1999-05-09", start: "2023-02-01", manager: "mouad.omlil@ynov.com", risk: 28, band: "LOW", eng: 8, rating: 4 },
  { email: "driss.lahbil@ynov.com", name: "Driss Lahbil", role: "EMPLOYEE", title: "Backend Developer", department: "Engineering", location: "Fès", salary: 168000, gender: "MALE", birth: "2000-01-25", start: "2023-04-01", manager: "mouad.omlil@ynov.com", risk: 45, band: "MEDIUM", eng: 6, rating: 4 },
  { email: "khadija.ibisk@ynov.com", name: "Khadija Ibisk", role: "EMPLOYEE", title: "Frontend Developer (i18n)", department: "Engineering", location: "Marrakech", salary: 162000, gender: "FEMALE", birth: "2000-09-18", start: "2023-09-01", manager: "mouad.omlil@ynov.com", risk: 24, band: "LOW", eng: 9, rating: 5 },
  { email: "elmahdi.elboughdadi@ynov.com", name: "El Mahdi El Boughdadi", role: "EMPLOYEE", title: "DevOps Engineer", department: "Infrastructure", location: "Rabat", salary: 180000, gender: "MALE", birth: "1997-12-02", start: "2023-06-01", manager: "mouad.omlil@ynov.com", risk: 52, band: "MEDIUM", eng: 6, rating: 4 },
  { email: "soukaina.gounissi@ynov.com", name: "Soukaina Gounissi", role: "EMPLOYEE", title: "UX/UI Designer", department: "Design", location: "Tanger", salary: 158000, gender: "FEMALE", birth: "1999-08-27", start: "2023-11-01", manager: "yassine.elhaddad@ynov.com", risk: 20, band: "LOW", eng: 8, rating: 5 },
];

const LEAVE_REQUESTS: {
  who: string;
  approver: string;
  type: LeaveType;
  fromInDays: number;
  len: number;
  status: LeaveStatus;
}[] = [
  { who: "chaimaa.mellouk@ynov.com", approver: "mouad.omlil@ynov.com", type: "VACATION", fromInDays: 8, len: 5, status: "PENDING" },
  { who: "driss.lahbil@ynov.com", approver: "mouad.omlil@ynov.com", type: "SICK", fromInDays: -3, len: 2, status: "APPROVED" },
  { who: "soukaina.gounissi@ynov.com", approver: "yassine.elhaddad@ynov.com", type: "PERSONAL", fromInDays: 14, len: 1, status: "PENDING" },
  { who: "khadija.ibisk@ynov.com", approver: "mouad.omlil@ynov.com", type: "VACATION", fromInDays: 21, len: 4, status: "APPROVED" },
];

const NOW = new Date();
const at = (deltaDays: number) => new Date(NOW.getTime() + deltaDays * 86_400_000);
const monthStart = (back: number) =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - back, 1));

export async function seedTeam(): Promise<void> {
  const emails = PEOPLE.map((p) => p.email);

  // First-run gate: if the whole team is already present, skip entirely.
  const present = await prisma.user.count({ where: { email: { in: emails } } });
  if (present >= PEOPLE.length) {
    console.log(`• Team already seeded (${present}/${PEOPLE.length}) — skipping.`);
    return;
  }
  console.log(`• Seeding HARI team (${present}/${PEOPLE.length} present)…`);

  const passwordHash = await bcrypt.hash(TEAM_PASSWORD, 10);
  const weight = await prisma.predictiveWeightConfig.findFirst({
    where: { active: true },
    select: { version: true },
  });
  const weightVersion = weight?.version ?? 1;
  const empIdByEmail: Record<string, string> = {};

  // Pass 1 — users + employees (add if missing, skip if present).
  for (const p of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        name: p.name,
        role: p.role,
        passwordHash,
        emailVerified: NOW,
        employee: {
          create: {
            title: p.title,
            department: p.department,
            location: p.location,
            startDate: new Date(p.start),
            status: "ACTIVE",
            employmentType: "FULL_TIME",
            salary: p.salary,
            contractType: "CDI",
            gender: p.gender,
            birthDate: new Date(p.birth),
            timeToHireDays: 30,
          },
        },
      },
      include: { employee: { select: { id: true } } },
    });
    const emp =
      user.employee ??
      (await prisma.employee.create({
        data: {
          userId: user.id, title: p.title, department: p.department, location: p.location,
          startDate: new Date(p.start), salary: p.salary, contractType: "CDI",
          gender: p.gender, birthDate: new Date(p.birth),
        },
        select: { id: true },
      }));
    empIdByEmail[p.email] = emp.id;
  }

  // Pass 2 — manager links.
  for (const p of PEOPLE) {
    if (p.manager) {
      await prisma.employee.update({
        where: { id: empIdByEmail[p.email] },
        data: { managerId: empIdByEmail[p.manager] },
      });
    }
  }

  // Pass 3 — leave balances + analytics signals (each guarded → add if missing).
  for (const p of PEOPLE) {
    const empId = empIdByEmail[p.email];
    const reviewerId = p.manager ? empIdByEmail[p.manager] : null;

    for (const [type, totalDays, usedDays] of [
      ["VACATION", 22, 6], ["SICK", 10, 1], ["PERSONAL", 5, 1],
    ] as const) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_type: { employeeId: empId, type } },
        update: { totalDays, usedDays },
        create: { employeeId: empId, type, totalDays, usedDays },
      });
    }

    if ((await prisma.performanceReview.count({ where: { employeeId: empId } })) === 0) {
      const conductedAt = at(-60);
      await prisma.performanceReview.create({
        data: { employeeId: empId, reviewerId, conductedAt, rating: p.rating },
      });
      await prisma.employee.update({ where: { id: empId }, data: { lastReviewDate: conductedAt } });
    }

    if ((await prisma.departureRiskSnapshot.count({ where: { employeeId: empId } })) === 0) {
      await prisma.departureRiskSnapshot.create({
        data: {
          employeeId: empId, score: p.risk, band: p.band, weightVersion,
          factors: [
            { key: "tenure", contribution: p.risk > 40 ? 12 : 5 },
            { key: "engagement", contribution: p.eng >= 8 ? -6 : 4 },
            { key: "review", contribution: -2 },
          ],
        },
      });
    }

    if ((await prisma.engagementSurvey.count({ where: { employeeId: empId } })) === 0) {
      await prisma.engagementSurvey.create({
        data: { employeeId: empId, score: p.eng, surveyDate: at(-20), source: "quarterly-pulse" },
      });
    }

    if ((await prisma.salaryChange.count({ where: { employeeId: empId } })) === 0) {
      await prisma.salaryChange.create({
        data: { employeeId: empId, effectiveDate: new Date(p.start), amount: p.salary, reason: "Embauche" },
      });
    }

    for (let m = 0; m < 3; m++) {
      await prisma.payrollSnapshot.upsert({
        where: { employeeId_month: { employeeId: empId, month: monthStart(m) } },
        update: { grossAmount: Math.round(p.salary / 12) },
        create: { employeeId: empId, month: monthStart(m), grossAmount: Math.round(p.salary / 12) },
      });
    }
  }

  // A few leave requests so Time Off + approvals look alive.
  for (const r of LEAVE_REQUESTS) {
    const empId = empIdByEmail[r.who];
    const startDate = at(r.fromInDays);
    const exists = await prisma.leaveRequest.findFirst({
      where: { employeeId: empId, type: r.type, startDate },
    });
    if (!exists) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: empId, type: r.type, startDate, endDate: at(r.fromInDays + r.len), days: r.len,
          reason: r.status === "PENDING" ? "Congé planifié" : "Absence",
          status: r.status,
          approverId: r.status === "APPROVED" ? empIdByEmail[r.approver] : null,
          decisionNote: r.status === "APPROVED" ? "Validé" : null,
        },
      });
    }
  }

  const total = await prisma.employee.count();
  console.log(`• Team seeded: ${PEOPLE.length} members. Employees in DB: ${total}.`);
}

// Run standalone (node --import tsx prisma/seed-team.ts).
seedTeam()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

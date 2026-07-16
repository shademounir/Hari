-- HARI-RBAC (2/2): roles become data.
--
-- The "Role" ENUM is replaced by a "Role" TABLE so a super admin can define
-- custom roles at runtime. Every existing User keeps exactly the permissions it
-- had: the four built-ins are inserted with permissions = NULL, which the
-- resolver reads as "use the code defaults" (DEFAULT_ROLE_PERMISSIONS in
-- lib/rbac.ts). That NULL is what stops this migration from ever drifting from
-- the built-in matrix — there is still one source of truth for it, in code.
--
-- Three columns were typed by the enum, and they do NOT get the same treatment:
--   • User.role          → TEXT + FK to Role.slug   (live assignment)
--   • AiEvent.role       → TEXT, deliberately NO FK (historical snapshot)
--   • AuditLog.actorRole → TEXT, deliberately NO FK (historical snapshot)
-- Both snapshots are denormalized precisely so the trail survives the actor
-- being deleted; an FK would resurrect that coupling and break the trail when a
-- custom role is removed. Readers fall back to the raw slug for a label.
--
-- ORDER MATTERS. The enum must be detached from all three columns and dropped
-- BEFORE the table is created: a table has an associated composite type of the
-- same name, so `CREATE TABLE "Role"` fails with 42710 while the enum lives.
-- The columns hold plain text ('EMPLOYEE', …) in between, and the FK is added
-- last, once the rows it points at exist.
--
-- (As with the other hand-authored migrations, the spurious drift statements
-- Prisma's dev diff emits against the raw-SQL-managed pgvector/FTS objects on
-- HandbookChunk are intentionally omitted so they are never touched.)

-- AlterTable: User.role enum -> role slug. The DEFAULT must be dropped before the
-- type change (it is still 'EMPLOYEE'::"Role") and restored as text after.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

-- AlterTable: the two historical snapshots. Type only -- no FK, by design.
ALTER TABLE "AiEvent" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
ALTER TABLE "AuditLog" ALTER COLUMN "actorRole" TYPE TEXT USING "actorRole"::TEXT;

-- DropEnum: nothing is typed by it any more. Must precede CreateTable (see above).
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "Role" (
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "permissions" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("slug")
);

-- Seed the built-in roles. This lives in the migration rather than the seed
-- because the foreign key below needs the rows to exist -- and because a role
-- table with no roles is not a valid state for this app at any point.
-- permissions = NULL on every one: the code defaults stay authoritative.
INSERT INTO "Role" ("slug", "label", "description", "builtIn", "rank", "permissions", "updatedAt") VALUES
    ('EMPLOYEE',    'Employee',    'Self-service: own profile, leave, payslips, and the handbook.',    true, 0, NULL, CURRENT_TIMESTAMP),
    ('MANAGER',     'Manager',     'Everything an employee can do, plus their direct reports.',        true, 1, NULL, CURRENT_TIMESTAMP),
    ('HR_ADMIN',    'HR Admin',    'Company-wide HR: directory, payroll, analytics, knowledge base.',  true, 2, NULL, CURRENT_TIMESTAMP),
    ('SUPER_ADMIN', 'Super Admin', 'HR Admin, plus platform settings, roles, and permissions.',        true, 3, NULL, CURRENT_TIMESTAMP);

-- AlterTable: account state. Distinct from Employee.status -- offboarding
-- ARCHIVES the employee record, this disables the LOGIN. Existing users are
-- active, so the default backfills correctly.
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey: RESTRICT makes "reassign the users before deleting a role" a
-- database guarantee rather than a UI check. UPDATE CASCADE lets a slug rename
-- carry to its holders (built-in slugs are immutable in the app regardless).
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

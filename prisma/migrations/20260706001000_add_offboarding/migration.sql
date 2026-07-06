-- SCRUM-096: offboarding workflow + compliance audit actions.
-- Purely additive: new enums + two tables + three AuditAction values. The new
-- enum values are not USED in this migration, so adding them is transaction-safe.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'OFFBOARDING_INITIATED';
ALTER TYPE "AuditAction" ADD VALUE 'OFFBOARDING_STEP_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_OFFBOARDED';

-- CreateEnum
CREATE TYPE "OffboardingReason" AS ENUM ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "OffboardingState" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OffboardingTaskStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "OffboardingCategory" AS ENUM ('ACCESS', 'EQUIPMENT', 'PAYROLL', 'KNOWLEDGE', 'EXIT');

-- CreateTable
CREATE TABLE "Offboarding" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" "OffboardingReason" NOT NULL,
    "state" "OffboardingState" NOT NULL DEFAULT 'IN_PROGRESS',
    "lastDay" TIMESTAMP(3) NOT NULL,
    "initiatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Offboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingTask" (
    "id" TEXT NOT NULL,
    "offboardingId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "OffboardingCategory" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "OffboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OffboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offboarding_employeeId_key" ON "Offboarding"("employeeId");

-- CreateIndex
CREATE INDEX "Offboarding_state_idx" ON "Offboarding"("state");

-- CreateIndex
CREATE INDEX "OffboardingTask_offboardingId_idx" ON "OffboardingTask"("offboardingId");

-- AddForeignKey
ALTER TABLE "Offboarding" ADD CONSTRAINT "Offboarding_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingTask" ADD CONSTRAINT "OffboardingTask_offboardingId_fkey" FOREIGN KEY ("offboardingId") REFERENCES "Offboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

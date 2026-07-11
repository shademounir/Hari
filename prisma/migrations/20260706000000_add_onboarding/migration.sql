-- SCRUM-095: personalized onboarding checklist for new hires.
-- Purely additive: two enums + one table + one index. Touches nothing else.

-- CreateEnum
CREATE TYPE "OnboardingCategory" AS ENUM ('PAPERWORK', 'EQUIPMENT', 'ACCESS', 'TRAINING', 'ORIENTATION');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "OnboardingCategory" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingTask_employeeId_idx" ON "OnboardingTask"("employeeId");

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SCRUM-098: predictive workforce analytics. Purely additive — a new enum, one
-- new AlertKind value, three nullable Employee columns, and five tables with
-- their indexes/FKs. No existing column is altered or dropped. (As with the
-- other hand-authored migrations, any spurious drift statements Prisma's dev
-- diff emits for the raw-SQL-managed pgvector/FTS objects are intentionally
-- omitted so they are never touched.)

-- AlterEnum: add the departure-risk alert kind.
ALTER TYPE "AlertKind" ADD VALUE 'DEPARTURE_RISK';

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable: predictive signal anchors on Employee (all nullable → safe on existing rows).
ALTER TABLE "Employee"
    ADD COLUMN "lastReviewDate" TIMESTAMP(3),
    ADD COLUMN "lastRoleChangeDate" TIMESTAMP(3),
    ADD COLUMN "leftAt" TIMESTAMP(3);

-- AlterTable: PerformanceReview already exists (SCRUM-097 analytics migration).
-- SCRUM-098 only adds an optional rating used for explicability.
ALTER TABLE "PerformanceReview" ADD COLUMN "rating" INTEGER;

-- CreateTable
CREATE TABLE "SalaryChange" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSurvey" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "surveyDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictiveWeightConfig" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "weights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictiveWeightConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureRiskSnapshot" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "band" "RiskBand" NOT NULL,
    "factors" JSONB NOT NULL,
    "weightVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departedWithin90d" BOOLEAN,

    CONSTRAINT "DepartureRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryChange_employeeId_effectiveDate_idx" ON "SalaryChange"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "EngagementSurvey_employeeId_surveyDate_idx" ON "EngagementSurvey"("employeeId", "surveyDate");

-- CreateIndex
CREATE UNIQUE INDEX "PredictiveWeightConfig_version_key" ON "PredictiveWeightConfig"("version");

-- CreateIndex
CREATE INDEX "PredictiveWeightConfig_active_idx" ON "PredictiveWeightConfig"("active");

-- CreateIndex
CREATE INDEX "DepartureRiskSnapshot_employeeId_computedAt_idx" ON "DepartureRiskSnapshot"("employeeId", "computedAt");

-- CreateIndex
CREATE INDEX "DepartureRiskSnapshot_band_idx" ON "DepartureRiskSnapshot"("band");

-- AddForeignKey
ALTER TABLE "SalaryChange" ADD CONSTRAINT "SalaryChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSurvey" ADD CONSTRAINT "EngagementSurvey_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureRiskSnapshot" ADD CONSTRAINT "DepartureRiskSnapshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
